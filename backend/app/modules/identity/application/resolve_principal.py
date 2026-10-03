"""
app/modules/identity/application/resolve_principal.py — Principal Resolution Use Case.

Traverses:
- Session lookup via HMAC-SHA256 digest
- Expiration and idle timeout checks (Fix 10)
- User & Org status checks
- Membership verification (Fix 8)
- Capability & Jurisdiction aggregation (Fix 4, Fix 14)
- Sharing grant retrieval
- Assignment context attachment (Fix 15)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError
from app.modules.identity.application.ports import IdentityRepositoryPort
from app.modules.identity.domain.assignment_context import AssignmentContext
from app.modules.identity.domain.audit_events import IdentityAuditEvent
from app.modules.identity.domain.enums import Capability, GrantScopeType, OrgKind, ResourceKind, Role
from app.modules.identity.domain.principal import PrincipalContext, SharingGrantContext
from app.modules.identity.domain.role_capabilities import get_role_baseline_capabilities
from app.modules.identity.infrastructure.token_hasher import compute_token_digest


class ResolvePrincipalUseCase:
    """
    Resolves an authenticated session into a full PrincipalContext domain object.
    """

    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo

    async def execute(self, raw_session_token: str) -> PrincipalContext:
        settings = get_settings()
        now = datetime.now(timezone.utc)

        # 1. Compute digest for lookup
        token_digest = compute_token_digest(raw_session_token, settings.TOKEN_HMAC_KEY)

        # 2. Look up session
        session = await self.repo.get_session_by_token_digest(token_digest)
        if not session:
            raise AuthenticationError("Invalid or non-existent session")

        # 3. Check revocation
        if session.is_revoked:
            raise AuthenticationError(
                f"Session was revoked: {session.revocation_reason or 'unspecified'}"
            )

        # 4. Check absolute expiration
        if session.expires_at <= now:
            raise AuthenticationError("Session expired")

        # 5. Check idle timeout (Fix 10)
        idle_deadline = session.last_seen_at + timedelta(
            minutes=settings.SESSION_IDLE_TIMEOUT_MINUTES
        )
        if now > idle_deadline:
            await self.repo.revoke_session(session.id, reason="idle_timeout")
            await self.repo.emit_audit_event(
                event=IdentityAuditEvent.SESSION_IDLE_TIMEOUT,
                actor_id=session.user_id,
                resource_id=session.id,
                payload={"reason": "idle_timeout"},
            )
            raise AuthenticationError("Session expired due to inactivity")

        # 6. Touch session last_seen_at
        await self.repo.touch_session(session.id, last_seen_at=now)

        # 7. Check user
        user = await self.repo.get_user_by_id(session.user_id)
        if not user or not user.is_active:
            raise AuthenticationError("User account is inactive or not found")

        # 8. Check organization
        org = await self.repo.get_organization_by_id(session.org_id)
        if not org or not org.is_active:
            raise AuthenticationError("Organization is inactive or not found")

        # 9. Check membership
        membership = await self.repo.get_membership(session.user_id, session.org_id)
        if not membership or not membership.is_effective(now):
            raise AuthenticationError("User does not have an active membership in this organization")

        role = Role(membership.role)

        # 10. Aggregate capabilities: baseline role capabilities + active grants
        capabilities = set(get_role_baseline_capabilities(role))
        jurisdiction_ids: set[UUID] = set()

        grants = await self.repo.get_effective_grants_for_principal(
            user_id=session.user_id, org_id=session.org_id
        )
        for grant in grants:
            if grant.is_effective(now):
                if grant.scope_type == GrantScopeType.CAPABILITY:
                    for cap in grant.capabilities:
                        capabilities.add(Capability(cap))
                elif grant.scope_type == GrantScopeType.JURISDICTION:
                    for j_id in grant.jurisdiction_ids:
                        jurisdiction_ids.add(UUID(str(j_id)) if not isinstance(j_id, UUID) else j_id)

        # Expand granted jurisdictions down the hierarchy (a STATE grant covers its DISTRICTs).
        scope = await self.repo.resolve_jurisdiction_scope(jurisdiction_ids)

        # 11. Aggregate sharing grants available to this org
        sharing_grants_list = await self.repo.get_active_sharing_grants_for_org(session.org_id)
        sharing_contexts = {
            SharingGrantContext(
                owner_org_id=sg.owner_org_id,
                resource_kind=ResourceKind(sg.resource_kind),
                field_names=tuple(sg.field_names),
            )
            for sg in sharing_grants_list
            if sg.is_effective(now)
        }

        return PrincipalContext(
            user_id=user.id,
            org_id=org.id,
            org_name=org.name,
            org_kind=OrgKind(org.kind),
            role=role,
            capabilities=frozenset(capabilities),
            jurisdiction_ids=scope.all_ids,
            home_jurisdiction_id=scope.home_id,
            region_wide=scope.region_wide,
            sharing_grants=frozenset(sharing_contexts),
            assignment=AssignmentContext(),
            session_id=session.id,
            email=user.email,
            display_name=user.display_name,
            dev_mode=False,
        )
