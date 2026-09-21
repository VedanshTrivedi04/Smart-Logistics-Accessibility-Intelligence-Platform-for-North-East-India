"""
app/modules/identity/api/router.py — FastAPI route handlers for Identity & Auth.

Endpoints:
1. GET  /api/v1/auth/oidc/init          → Generates state+PKCE, returns redirect URL
2. GET  /api/v1/auth/oidc/callback      → Processes OIDC callback, exchanges code, creates session
3. POST /api/v1/auth/select-org         → Multi-org selection
4. POST /api/v1/auth/session/logout     → Revoke caller's current session
5. POST /api/v1/auth/session/logout-all → Revoke all user sessions
6. GET  /api/v1/auth/csrf-token         → Retrieve/rotate session-bound CSRF token
7. GET  /api/v1/me                      → Returns current PrincipalContext as JSON
8. POST /api/v1/auth/dev-session        → Dev-mode session creator (DEV_JWT_MODE only)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, Request, Response
from app.core.config import get_settings
from app.core.db import DbSession as AsyncSession, get_db
from app.core.exceptions import AuthenticationError, ForbiddenError
from app.core.security import SESSION_COOKIE_NAME, require_authenticated
from app.modules.identity.api.schemas import (
    CsrfTokenResponse,
    DevSessionRequest,
    MeResponse,
    MessageResponse,
    SelectOrgRequest,
)
from app.modules.identity.application.oidc_flow import InitOidcUseCase, ProcessOidcCallbackUseCase
from app.modules.identity.application.org_selection_service import SelectOrgUseCase
from app.modules.identity.application.resolve_principal import ResolvePrincipalUseCase
from app.modules.identity.application.session_service import (
    CreateSessionUseCase,
    RevokeAllUserSessionsUseCase,
    RevokeCurrentSessionUseCase,
)
from app.modules.identity.domain.entities import CSRFToken, Membership, Organization, User
from app.modules.identity.domain.enums import MembershipStatus, OrgKind, Role
from app.modules.identity.domain.principal import PrincipalContext
from app.modules.identity.infrastructure.dev_verifier import DevModeVerifier
from app.modules.identity.infrastructure.oidc_verifier import OidcVerifier
from app.modules.identity.infrastructure.repository import SqlAlchemyIdentityRepository
from app.modules.identity.infrastructure.token_hasher import compute_token_digest, generate_raw_token

router = APIRouter(prefix="/api/v1", tags=["Identity & Auth"])


def _set_session_cookie(response: Response, raw_token: str, max_age_hours: int = 8) -> None:
    """Set hardened HttpOnly, SameSite=Lax session cookie."""
    settings = get_settings()
    is_prod = settings.APP_ENV == "production"
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=max_age_hours * 3600,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    """Clear session cookie on logout."""
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


@router.get("/auth/oidc/init")
async def oidc_init(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Start OIDC Authorization Code Flow with PKCE."""
    repo = SqlAlchemyIdentityRepository(db)
    use_case = InitOidcUseCase(repo)
    client_ip = request.client.host if request.client else None
    return await use_case.execute(ip_address=client_ip)


@router.get("/auth/oidc/callback")
async def oidc_callback(
    code: str,
    state: str,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Process OIDC provider redirect callback."""
    repo = SqlAlchemyIdentityRepository(db)
    verifier = OidcVerifier()
    session_creator = CreateSessionUseCase(repo)
    use_case = ProcessOidcCallbackUseCase(repo, verifier, session_creator)

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    result = await use_case.execute(
        code=code,
        state=state,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    if result["status"] == "authenticated":
        _set_session_cookie(response, result["raw_session_token"])
        response.headers["X-CSRF-Token"] = result["raw_csrf_token"]
        resolver = ResolvePrincipalUseCase(repo)
        principal = await resolver.execute(result["raw_session_token"])
        return {
            "status": "authenticated",
            "csrf_token": result["raw_csrf_token"],
            "principal": MeResponse(
                user_id=principal.user_id,
                email=principal.email,
                display_name=principal.display_name or "User",
                org_id=principal.org_id,
                org_name=principal.org_name,
                org_kind=principal.org_kind.value,
                role=principal.role.value,
                capabilities=[c.value for c in principal.capabilities],
                jurisdiction_ids=list(principal.jurisdiction_ids),
                session_id=principal.session_id,
                dev_mode=principal.dev_mode,
            ),
        }

    return result


@router.post("/auth/select-org")
async def select_org(
    body: SelectOrgRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Select active organization context for multi-org users."""
    repo = SqlAlchemyIdentityRepository(db)
    session_creator = CreateSessionUseCase(repo)
    use_case = SelectOrgUseCase(repo, session_creator)

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    session, raw_session_token, raw_csrf_token = await use_case.execute(
        selection_token=body.selection_token,
        org_id=body.org_id,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    _set_session_cookie(response, raw_session_token)
    response.headers["X-CSRF-Token"] = raw_csrf_token
    resolver = ResolvePrincipalUseCase(repo)
    principal = await resolver.execute(raw_session_token)

    return {
        "csrf_token": raw_csrf_token,
        "principal": MeResponse(
            user_id=principal.user_id,
            email=principal.email,
            display_name=principal.display_name or "User",
            org_id=principal.org_id,
            org_name=principal.org_name,
            org_kind=principal.org_kind.value,
            role=principal.role.value,
            capabilities=[c.value for c in principal.capabilities],
            jurisdiction_ids=list(principal.jurisdiction_ids),
            session_id=principal.session_id,
            dev_mode=principal.dev_mode,
        ),
    }


@router.post("/auth/session/logout")
async def logout(
    response: Response,
    principal: PrincipalContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Revoke caller's active session."""
    if principal.session_id:
        repo = SqlAlchemyIdentityRepository(db)
        use_case = RevokeCurrentSessionUseCase(repo)
        await use_case.execute(principal.session_id, user_id=principal.user_id)

    _clear_session_cookie(response)
    return MessageResponse(message="Logged out successfully")


@router.post("/auth/session/logout-all")
async def logout_all(
    response: Response,
    principal: PrincipalContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Revoke all active sessions for this user."""
    repo = SqlAlchemyIdentityRepository(db)
    use_case = RevokeAllUserSessionsUseCase(repo)
    count = await use_case.execute(principal.user_id)
    _clear_session_cookie(response)
    return MessageResponse(message=f"All {count} active sessions have been revoked")


@router.get("/auth/csrf-token")
async def get_csrf_token(
    principal: PrincipalContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> CsrfTokenResponse:
    """Retrieve/rotate a valid session-bound CSRF token."""
    if not principal.session_id:
        # Dev-mode fallback
        return CsrfTokenResponse(csrf_token="dev-csrf-token-bypass")

    settings = get_settings()
    repo = SqlAlchemyIdentityRepository(db)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=settings.SESSION_ABSOLUTE_LIFETIME_HOURS)

    raw_csrf_token = generate_raw_token(32)
    csrf_digest = compute_token_digest(raw_csrf_token, settings.TOKEN_HMAC_KEY)

    token = CSRFToken(
        id=uuid.uuid4(),
        session_id=principal.session_id,
        token_digest=csrf_digest,
        created_at=now,
        expires_at=expires_at,
    )
    await repo.create_csrf_token(token)
    return CsrfTokenResponse(csrf_token=raw_csrf_token)


@router.get("/me")
async def get_me(
    principal: PrincipalContext = Depends(require_authenticated),
) -> MeResponse:
    """Return the authenticated caller's identity, role, and capabilities."""
    return MeResponse(
        user_id=principal.user_id,
        email=principal.email,
        display_name=principal.display_name or "User",
        org_id=principal.org_id,
        org_name=principal.org_name,
        org_kind=principal.org_kind.value,
        role=principal.role.value,
        capabilities=[c.value for c in principal.capabilities],
        jurisdiction_ids=list(principal.jurisdiction_ids),
        session_id=principal.session_id,
        dev_mode=principal.dev_mode,
    )


@router.post("/auth/dev-session")
async def dev_session(
    body: DevSessionRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    DEV ONLY: Create a full server session for local development without OIDC.
    Guarded by DevModeVerifier — strictly blocked in staging and production.
    """
    settings = get_settings()
    verifier = DevModeVerifier(settings)
    user_id, org_id, role = verifier.validate_dev_credentials(
        str(body.user_id), str(body.org_id), body.role
    )

    repo = SqlAlchemyIdentityRepository(db)
    now = datetime.now(timezone.utc)

    # Ensure user exists
    user = await repo.get_user_by_id(user_id)
    if not user:
        user = User(
            id=user_id,
            issuer="local-dev",
            subject=f"dev-sub-{user_id}",
            email="dev@example.com",
            display_name="Dev User",
            is_active=True,
            created_at=now,
        )
        from app.modules.identity.infrastructure.models import UserModel
        db.add(UserModel(
            id=user.id,
            issuer=user.issuer,
            subject=user.subject,
            email=user.email,
            display_name=user.display_name,
            is_active=True,
        ))
        await db.flush()

    # Ensure org exists
    org = await repo.get_organization_by_id(org_id)
    if not org:
        from app.modules.identity.infrastructure.models import OrganizationModel
        db.add(OrganizationModel(
            id=org_id,
            code=f"DEV_ORG_{str(org_id)[:8]}",
            name="Dev Organization",
            kind=OrgKind.GOVERNMENT.value,
            is_active=True,
        ))
        await db.flush()

    # Ensure membership exists
    membership = await repo.get_membership(user_id, org_id)
    if not membership:
        from app.modules.identity.infrastructure.models import MembershipModel
        db.add(MembershipModel(
            id=uuid.uuid4(),
            user_id=user_id,
            org_id=org_id,
            role=role.value,
            status=MembershipStatus.ACTIVE.value,
            valid_from=now,
        ))
        await db.flush()

    session_creator = CreateSessionUseCase(repo)
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    session, raw_session_token, raw_csrf_token = await session_creator.execute(
        user_id=user_id,
        org_id=org_id,
        role=role,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    _set_session_cookie(response, raw_session_token)
    response.headers["X-CSRF-Token"] = raw_csrf_token

    resolver = ResolvePrincipalUseCase(repo)
    principal = await resolver.execute(raw_session_token)

    return {
        "csrf_token": raw_csrf_token,
        "principal": MeResponse(
            user_id=principal.user_id,
            email=principal.email,
            display_name=principal.display_name or "Dev User",
            org_id=principal.org_id,
            org_name=principal.org_name,
            org_kind=principal.org_kind.value,
            role=principal.role.value,
            capabilities=[c.value for c in principal.capabilities],
            jurisdiction_ids=list(principal.jurisdiction_ids),
            session_id=principal.session_id,
            dev_mode=True,
        ),
    }
