"""
app/modules/identity/application/org_selection_service.py — Multi-organization selection flow.

Fix 7:
- Generates and verifies short-lived HMAC-signed selection tokens (5 min validity)
- Allows multi-org members to choose their active organization context
- Creates session bound to the selected org
"""

from __future__ import annotations

import base64
import json
import time
from uuid import UUID

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError, ForbiddenError, NoActiveMembershipError
from app.modules.identity.application.ports import IdentityRepositoryPort
from app.modules.identity.application.session_service import CreateSessionUseCase
from app.modules.identity.domain.audit_events import IdentityAuditEvent
from app.modules.identity.domain.entities import Session
from app.modules.identity.domain.enums import Role
from app.modules.identity.infrastructure.token_hasher import compute_token_digest, verify_token_digest


def create_selection_token(user_id: UUID, hmac_key: str, expires_in_seconds: int = 300) -> str:
    """
    Generate short-lived signed selection token for multi-org choices.
    Payload: {"uid": str(user_id), "exp": int(time.time() + expires_in_seconds)}
    Format: base64(payload).signature
    """
    payload_dict = {
        "uid": str(user_id),
        "exp": int(time.time()) + expires_in_seconds,
    }
    raw_payload = base64.urlsafe_b64encode(json.dumps(payload_dict).encode("utf-8")).decode("ascii")
    signature = compute_token_digest(raw_payload, hmac_key)
    return f"{raw_payload}.{signature}"


def verify_selection_token(token: str, hmac_key: str) -> UUID:
    """
    Verify selection token signature and expiration.
    Returns user_id if valid; raises AuthenticationError otherwise.
    """
    try:
        parts = token.split(".")
        if len(parts) != 2:
            raise AuthenticationError("Invalid selection token format")

        raw_payload, signature = parts
        if not verify_token_digest(raw_payload, signature, hmac_key):
            raise AuthenticationError("Invalid selection token signature")

        payload_bytes = base64.urlsafe_b64decode(raw_payload.encode("ascii"))
        payload_dict = json.loads(payload_bytes.decode("utf-8"))

        now = int(time.time())
        if payload_dict.get("exp", 0) <= now:
            raise AuthenticationError("Selection token has expired")

        return UUID(payload_dict["uid"])
    except AuthenticationError:
        raise
    except Exception as exc:
        raise AuthenticationError(f"Could not parse selection token: {exc}") from exc


class SelectOrgUseCase:
    def __init__(self, repo: IdentityRepositoryPort, session_creator: CreateSessionUseCase) -> None:
        self.repo = repo
        self.session_creator = session_creator

    async def execute(
        self,
        selection_token: str,
        org_id: UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[Session, str, str]:
        settings = get_settings()
        user_id = verify_selection_token(selection_token, settings.TOKEN_HMAC_KEY)

        # Check membership exists and is active for this org
        membership = await self.repo.get_membership(user_id, org_id)
        if not membership:
            raise ForbiddenError("User is not a member of the selected organization")

        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        if not membership.is_effective(now):
            raise NoActiveMembershipError("Membership in selected organization is inactive or expired")

        # Create session bound to selected org
        session, raw_session_token, raw_csrf_token = await self.session_creator.execute(
            user_id=user_id,
            org_id=org_id,
            role=Role(membership.role),
            ip_address=ip_address,
            user_agent=user_agent,
        )

        await self.repo.emit_audit_event(
            event=IdentityAuditEvent.ORG_SELECTED_MULTI_MEMBER,
            actor_id=user_id,
            resource_id=session.id,
            payload={"org_id": str(org_id), "role": membership.role},
        )

        return session, raw_session_token, raw_csrf_token
