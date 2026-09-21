"""
app/modules/identity/application/grant_service.py — Grant lifecycle & authority validation.

Fix 4:
- Grant authority rules (grantor cannot grant capabilities or jurisdictions they lack)
- XOR grantee constraint
- Revocation permissions
- Sharing grant creation and revocation
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from uuid import UUID

from app.core.exceptions import ForbiddenError, GrantAuthorityError, NotFoundError
from app.modules.identity.application.ports import IdentityRepositoryPort
from app.modules.identity.domain.audit_events import IdentityAuditEvent
from app.modules.identity.domain.entities import Grant, SharingGrant
from app.modules.identity.domain.enums import Capability, GrantScopeType, ResourceKind, Role
from app.modules.identity.domain.principal import PrincipalContext


class ValidateGrantAuthorityUseCase:
    """
    Validates that the grantor possesses all capabilities and jurisdiction scopes
    they are attempting to delegate.
    """

    def validate(
        self,
        grantor: PrincipalContext,
        scope_type: GrantScopeType,
        capabilities: list[Capability],
        jurisdiction_ids: list[UUID],
    ) -> None:
        if scope_type == GrantScopeType.CAPABILITY:
            for cap in capabilities:
                if not grantor.can(cap):
                    raise GrantAuthorityError(
                        f"Cannot grant capability '{cap.value}' which you do not possess"
                    )
        elif scope_type == GrantScopeType.JURISDICTION:
            for j_id in jurisdiction_ids:
                if not grantor.has_jurisdiction(j_id):
                    raise GrantAuthorityError(
                        f"Cannot grant jurisdiction scope '{j_id}' beyond your own"
                    )


class CreateGrantUseCase:
    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo
        self.validator = ValidateGrantAuthorityUseCase()

    async def execute(
        self,
        grantor: PrincipalContext,
        scope_type: GrantScopeType,
        grantee_user_id: UUID | None,
        grantee_org_id: UUID | None,
        capabilities: list[Capability],
        jurisdiction_ids: list[UUID],
        valid_from: datetime | None = None,
        valid_until: datetime | None = None,
    ) -> Grant:
        # 1. Enforce XOR constraint at application boundary
        if (grantee_user_id is None and grantee_org_id is None) or (
            grantee_user_id is not None and grantee_org_id is not None
        ):
            raise GrantAuthorityError("Grant must specify either a grantee user OR a grantee org, not both")

        # 2. Validate authority of grantor
        self.validator.validate(grantor, scope_type, capabilities, jurisdiction_ids)

        now = datetime.now(timezone.utc)
        effective_valid_from = valid_from or now
        if valid_until and valid_until <= effective_valid_from:
            raise GrantAuthorityError("Grant valid_until must be strictly after valid_from")

        grant = Grant(
            id=uuid.uuid4(),
            grantor_user_id=grantor.user_id,
            grantor_org_id=grantor.org_id,
            scope_type=scope_type,
            grantee_user_id=grantee_user_id,
            grantee_org_id=grantee_org_id,
            capabilities=tuple(capabilities),
            jurisdiction_ids=tuple(jurisdiction_ids),
            valid_from=effective_valid_from,
            valid_until=valid_until,
            is_active=True,
            created_at=now,
        )

        saved = await self.repo.create_grant(grant)
        await self.repo.emit_audit_event(
            event=IdentityAuditEvent.GRANT_CREATED,
            actor_id=grantor.user_id,
            resource_id=saved.id,
            payload={
                "scope_type": scope_type.value,
                "grantee_user_id": str(grantee_user_id) if grantee_user_id else None,
                "grantee_org_id": str(grantee_org_id) if grantee_org_id else None,
                "capabilities": [c.value for c in capabilities],
                "jurisdiction_ids": [str(j) for j in jurisdiction_ids],
            },
        )
        return saved


class RevokeGrantUseCase:
    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo

    async def execute(
        self,
        principal: PrincipalContext,
        grant_id: UUID,
        reason: str,
    ) -> None:
        grant = await self.repo.get_grant_by_id(grant_id)
        if not grant:
            raise NotFoundError("Grant not found")

        # Can only be revoked by PLATFORM_ADMINISTRATOR or original grantor
        if principal.role != Role.PLATFORM_ADMINISTRATOR and grant.grantor_user_id != principal.user_id:
            raise ForbiddenError("Only the original grantor or a Platform Administrator can revoke this grant")

        await self.repo.revoke_grant(grant_id, revoked_by=principal.user_id, reason=reason)
        await self.repo.emit_audit_event(
            event=IdentityAuditEvent.GRANT_REVOKED,
            actor_id=principal.user_id,
            resource_id=grant_id,
            payload={"reason": reason},
        )


class CreateSharingGrantUseCase:
    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo

    async def execute(
        self,
        principal: PrincipalContext,
        recipient_org_id: UUID,
        resource_kind: ResourceKind,
        field_names: list[str] | None = None,
        valid_until: datetime | None = None,
    ) -> SharingGrant:
        # Only FLEET_MANAGER (for their org) or PLATFORM_ADMINISTRATOR can create sharing grants
        if principal.role not in (Role.FLEET_MANAGER, Role.PLATFORM_ADMINISTRATOR):
            raise ForbiddenError("Only Fleet Managers and Platform Administrators can create sharing grants")

        now = datetime.now(timezone.utc)
        sharing_grant = SharingGrant(
            id=uuid.uuid4(),
            owner_org_id=principal.org_id,
            recipient_org_id=recipient_org_id,
            resource_kind=resource_kind,
            field_names=tuple(field_names or []),
            valid_from=now,
            valid_until=valid_until,
            is_active=True,
            created_at=now,
        )
        saved = await self.repo.create_sharing_grant(sharing_grant)
        await self.repo.emit_audit_event(
            event=IdentityAuditEvent.SHARING_GRANT_CREATED,
            actor_id=principal.user_id,
            resource_id=saved.id,
            payload={
                "owner_org_id": str(principal.org_id),
                "recipient_org_id": str(recipient_org_id),
                "resource_kind": resource_kind.value,
            },
        )
        return saved
