"""
app/core/security.py — Authentication and Authorization dependencies.

Implements all 6 security layers:
- Layer 1 & 2: Session cookie validation (HMAC-SHA256 digest lookup)
- Layer 3: PrincipalContext resolution + RLS session context injection
- Layer 4: Capability enforcement
- Layer 5: Tenancy and sharing scope authorization
- Layer 6: PostgreSQL transaction-local RLS

Also enforces:
- CSRF validation for state-mutating requests (Fix 11)
- Origin header validation (Fix 12)
- Strict Dev-Mode guards (Fix 13)
- Policy 4 (404 vs 403)
"""

from __future__ import annotations

from typing import Callable
from uuid import UUID

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db, set_transaction_rls_context
from app.core.exceptions import (
    AuthenticationError,
    CSRFValidationError,
    ForbiddenError,
    NotFoundError,
    OriginForbiddenError,
)
from app.core.metrics import (
    auth_failure_total,
    auth_success_total,
    authz_denied_total,
    csrf_failure_total,
    origin_failure_total,
)
from app.modules.identity.application.check_capability import (
    CapabilityCheckRequest,
    CheckCapabilityUseCase,
    enforce_capability,
)
from app.modules.identity.application.resolve_principal import ResolvePrincipalUseCase
from app.modules.identity.domain.enums import Capability, OrgKind, ResourceKind, Role
from app.modules.identity.domain.principal import PrincipalContext
from app.modules.identity.domain.role_capabilities import get_role_baseline_capabilities
from app.modules.identity.infrastructure.dev_verifier import DevModeVerifier
from app.modules.identity.infrastructure.repository import SqlAlchemyIdentityRepository
from app.modules.identity.infrastructure.token_hasher import compute_token_digest, verify_token_digest

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
SESSION_COOKIE_NAME = "ner_session"


async def validate_origin(request: Request) -> None:
    """
    Origin validation for state-mutating HTTP requests (Fix 12).
    """
    if request.method not in UNSAFE_METHODS:
        return

    # Machine-to-machine telemetry bypass
    if request.url.path.startswith("/api/v1/telemetry"):
        return

    origin = request.headers.get("Origin")
    settings = get_settings()

    if origin is None:
        if settings.STRICT_ORIGIN_CHECK:
            origin_failure_total.labels(reason="missing_origin").inc()
            raise OriginForbiddenError("Origin header required for mutating browser requests")
        return

    if origin not in settings.ALLOWED_ORIGINS:
        origin_failure_total.labels(reason="forbidden_origin").inc()
        raise OriginForbiddenError(f"Origin '{origin}' is not permitted")


async def validate_csrf(
    request: Request, session_id: UUID | None, db: AsyncSession
) -> None:
    """
    Session-bound CSRF token validation using HMAC-SHA256 constant-time comparison (Fix 11).
    """
    if request.method not in UNSAFE_METHODS:
        return

    # Machine-to-machine bypass & dev session bypass
    if request.url.path.startswith("/api/v1/telemetry") or request.url.path.endswith("/dev-session"):
        return

    if not session_id:
        return

    csrf_header = request.headers.get("X-CSRF-Token")
    if not csrf_header:
        csrf_failure_total.labels(reason="missing_token").inc()
        raise CSRFValidationError("X-CSRF-Token header is required for state-mutating requests")

    settings = get_settings()
    repo = SqlAlchemyIdentityRepository(db)
    computed_digest = compute_token_digest(csrf_header, settings.TOKEN_HMAC_KEY)

    token_entity = await repo.get_valid_csrf_token(session_id, computed_digest)
    if not token_entity:
        csrf_failure_total.labels(reason="invalid_token").inc()
        raise CSRFValidationError("CSRF token is invalid, expired, or does not match session")


async def require_authenticated(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PrincipalContext:
    """
    FastAPI dependency: Authenticate request, enforce origin/CSRF, set RLS context,
    and return resolved PrincipalContext.
    """
    # 0. Enforce Origin check on mutating browser methods first (Fix 12)
    await validate_origin(request)

    settings = get_settings()
    repo = SqlAlchemyIdentityRepository(db)

    # 1. Check DEV mode headers first if enabled and in dev/test
    if settings.DEV_JWT_MODE and settings.APP_ENV in ("development", "test"):
        dev_user_header = request.headers.get("X-Dev-User-Id")
        if dev_user_header:
            try:
                verifier = DevModeVerifier(settings)
                dev_org_header = request.headers.get("X-Dev-Org-Id", "00000000-0000-4000-8000-000000000001")
                dev_role_header = request.headers.get("X-Dev-Role", "DISTRICT_VERIFIER")
                u_id, o_id, role = verifier.validate_dev_credentials(
                    dev_user_header, dev_org_header, dev_role_header
                )

                # Set RLS context for dev request if database connected
                try:
                    await set_transaction_rls_context(
                        db,
                        user_id=str(u_id),
                        org_id=str(o_id),
                        session_id=None,
                        role=role.value,
                    )
                except Exception:
                    pass

                auth_success_total.labels(auth_method="dev_header").inc()
                return PrincipalContext(
                    user_id=u_id,
                    org_id=o_id,
                    org_name="Dev Organization",
                    org_kind=OrgKind.GOVERNMENT,
                    role=role,
                    capabilities=get_role_baseline_capabilities(role),
                    dev_mode=True,
                )
            except Exception as exc:
                auth_failure_total.labels(reason="dev_header_invalid").inc()
                raise AuthenticationError(f"Invalid dev authentication: {exc}") from exc

    # 2. Extract session token from cookie
    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not raw_token:
        # Check Authorization Bearer header as fallback for API clients
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            raw_token = auth_header[7:].strip()

    if not raw_token:
        auth_failure_total.labels(reason="missing_session_token").inc()
        raise AuthenticationError("Authentication required: missing session token")

    # 3. Resolve principal via session lookup
    try:
        resolver = ResolvePrincipalUseCase(repo)
        principal = await resolver.execute(raw_token)
    except AuthenticationError as exc:
        auth_failure_total.labels(reason=str(exc)).inc()
        raise

    # 4. Enforce CSRF for unsafe browser methods
    await validate_csrf(request, principal.session_id, db)

    # 5. Set RLS context for database transaction
    try:
        await set_transaction_rls_context(
            db,
            user_id=str(principal.user_id),
            org_id=str(principal.org_id),
            session_id=str(principal.session_id) if principal.session_id else None,
            role=principal.role.value,
        )
    except Exception:
        pass

    auth_success_total.labels(auth_method="session_cookie").inc()
    return principal


def require_capability(
    capability: Capability,
    resource_kind: ResourceKind | None = None,
    extract_resource_org_id: Callable[[Request], UUID | None] | None = None,
    extract_resource_id: Callable[[Request], UUID | None] | None = None,
    extract_jurisdiction_id: Callable[[Request], UUID | None] | None = None,
) -> Callable:
    """
    FastAPI dependency factory: enforces required capability and resource visibility scopes.
    """
    async def dependency(
        request: Request,
        principal: PrincipalContext = Depends(require_authenticated),
    ) -> PrincipalContext:
        res_org_id = extract_resource_org_id(request) if extract_resource_org_id else None
        res_id = extract_resource_id(request) if extract_resource_id else None
        j_id = extract_jurisdiction_id(request) if extract_jurisdiction_id else None

        req = CapabilityCheckRequest(
            principal=principal,
            required_capability=capability,
            resource_org_id=res_org_id,
            resource_kind=resource_kind,
            resource_id=res_id,
            jurisdiction_id=j_id,
        )

        try:
            enforce_capability(req)
        except (ForbiddenError, NotFoundError) as exc:
            authz_denied_total.labels(
                capability=capability.value,
                reason=exc.__class__.__name__,
            ).inc()
            raise

        return principal

    return dependency
