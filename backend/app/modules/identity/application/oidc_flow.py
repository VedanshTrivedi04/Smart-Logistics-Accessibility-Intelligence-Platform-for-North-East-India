"""
app/modules/identity/application/oidc_flow.py — Complete 14-Step OIDC Flow (Fix 2).

Includes:
- State generation and single-use consumption (preventing replay and CSRF)
- Nonce generation and verification in ID token
- PKCE code_verifier generation and code_challenge calculation (S256)
- Code exchange with PKCE verifier
- User upserting
- Multi-org selection branching (Fix 7)
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError, NoActiveMembershipError
from app.modules.identity.application.org_selection_service import create_selection_token
from app.modules.identity.application.ports import IdentityRepositoryPort, OidcVerifierPort
from app.modules.identity.application.session_service import CreateSessionUseCase
from app.modules.identity.domain.audit_events import IdentityAuditEvent
from app.modules.identity.domain.entities import AuthTransaction, Session
from app.modules.identity.domain.enums import Role
from app.modules.identity.domain.exceptions import InvalidAuthStateError


def compute_code_challenge(verifier: str) -> str:
    """Compute base64url(SHA256(verifier)) without padding."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


class InitOidcUseCase:
    """
    Step 1: Generates state, nonce, PKCE verifier/challenge, persists transaction,
    and constructs the provider redirect URL.
    """

    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo

    async def execute(self, ip_address: str | None = None) -> dict[str, str]:
        settings = get_settings()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=10)

        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        code_verifier = secrets.token_urlsafe(64)
        code_challenge = compute_code_challenge(code_verifier)

        tx = AuthTransaction(
            id=uuid.uuid4(),
            state=state,
            nonce=nonce,
            code_verifier=code_verifier,
            ip_address=ip_address,
            created_at=now,
            expires_at=expires_at,
        )
        await self.repo.create_auth_transaction(tx)

        # Build authorization endpoint URL
        base_url = settings.OIDC_ISSUER.rstrip("/")
        # Standard OIDC authorization endpoints
        if not base_url.endswith("/authorize") and not "auth" in base_url:
            auth_endpoint = f"{base_url}/protocol/openid-connect/auth"
        else:
            auth_endpoint = base_url

        params = {
            "response_type": "code",
            "client_id": settings.OIDC_CLIENT_ID,
            "redirect_uri": settings.OIDC_REDIRECT_URI,
            "scope": settings.OIDC_SCOPES,
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        redirect_url = f"{auth_endpoint}?{urlencode(params)}"

        return {
            "redirect_url": redirect_url,
            "state": state,
        }


class ProcessOidcCallbackUseCase:
    """
    Steps 3–14: Validates state/nonce, exchanges code via PKCE, verifies ID token,
    upserts user, checks memberships, and either creates session or initiates multi-org choice.
    """

    def __init__(
        self,
        repo: IdentityRepositoryPort,
        verifier: OidcVerifierPort,
        session_creator: CreateSessionUseCase,
    ) -> None:
        self.repo = repo
        self.verifier = verifier
        self.session_creator = session_creator

    async def execute(
        self,
        code: str,
        state: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> dict[str, Any]:
        settings = get_settings()
        now = datetime.now(timezone.utc)

        # Step 4: Validate state and single-use consumption
        tx = await self.repo.get_valid_auth_transaction(state)
        if not tx or not tx.is_valid(now):
            await self.repo.emit_audit_event(
                event=IdentityAuditEvent.OIDC_FLOW_FAILED,
                actor_id=None,
                resource_id=None,
                payload={"step": "state_validation", "state": state},
            )
            raise InvalidAuthStateError("Invalid or expired state parameter")

        # Consume immediately to guarantee single-use replay protection
        await self.repo.consume_auth_transaction(state)

        # Step 5: Exchange code with PKCE code_verifier
        try:
            tokens = await self.verifier.exchange_code(
                code=code,
                code_verifier=tx.code_verifier,
                redirect_uri=settings.OIDC_REDIRECT_URI,
            )
        except Exception as exc:
            await self.repo.emit_audit_event(
                event=IdentityAuditEvent.OIDC_FLOW_FAILED,
                actor_id=None,
                resource_id=None,
                payload={"step": "token_exchange", "error": str(exc)},
            )
            raise AuthenticationError(f"OIDC token exchange failed: {exc}") from exc

        id_token = tokens.get("id_token")
        if not id_token:
            raise AuthenticationError("OIDC provider did not return an id_token")

        # Step 6: Verify ID token signature and nonce
        try:
            claims = await self.verifier.verify_id_token(id_token=id_token, nonce=tx.nonce)
        except Exception as exc:
            await self.repo.emit_audit_event(
                event=IdentityAuditEvent.OIDC_FLOW_FAILED,
                actor_id=None,
                resource_id=None,
                payload={"step": "id_token_validation", "error": str(exc)},
            )
            raise AuthenticationError(f"ID token validation failed: {exc}") from exc

        # Step 7: Extract claims
        subject = claims.get("sub")
        issuer = claims.get("iss", settings.OIDC_ISSUER)
        email = claims.get("email")
        display_name = claims.get("name") or claims.get("preferred_username") or email or "User"

        if not subject:
            raise AuthenticationError("Missing subject (sub) claim in ID token")

        # Step 8: Upsert user
        user = await self.repo.upsert_user(
            issuer=issuer,
            subject=subject,
            email=email,
            display_name=display_name,
        )

        # Step 9: Load active memberships
        memberships = await self.repo.get_active_memberships_for_user(user.id)
        effective_memberships = [m for m in memberships if m.is_effective(now)]

        # Step 10: Multi-org selection branching
        if len(effective_memberships) == 0:
            await self.repo.emit_audit_event(
                event=IdentityAuditEvent.AUTH_FAILED,
                actor_id=user.id,
                resource_id=None,
                payload={"reason": "no_active_membership"},
            )
            raise NoActiveMembershipError("User has no active organization memberships")

        if len(effective_memberships) == 1:
            single = effective_memberships[0]
            session, raw_session_token, raw_csrf_token = await self.session_creator.execute(
                user_id=user.id,
                org_id=single.org_id,
                role=Role(single.role),
                ip_address=ip_address,
                user_agent=user_agent,
            )
            return {
                "status": "authenticated",
                "session": session,
                "raw_session_token": raw_session_token,
                "raw_csrf_token": raw_csrf_token,
                "user": user,
                "org_id": single.org_id,
                "role": single.role,
            }

        # Multiple memberships -> return choices and short-lived selection token
        selection_token = create_selection_token(user.id, settings.TOKEN_HMAC_KEY)
        choices = []
        for m in effective_memberships:
            org = await self.repo.get_organization_by_id(m.org_id)
            choices.append({
                "org_id": str(m.org_id),
                "org_name": org.name if org else "Unknown",
                "org_kind": org.kind if org else "GOVERNMENT",
                "role": m.role,
            })

        return {
            "status": "org_selection_required",
            "selection_token": selection_token,
            "org_choices": choices,
            "user": user,
        }
