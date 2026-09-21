"""
app/modules/identity/application/membership_service.py — Membership lifecycle operations.

Fix 8: Explicit membership states (ACTIVE, SUSPENDED, EXPIRED, REVOKED).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from uuid import UUID

from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.identity.application.ports import IdentityRepositoryPort
from app.modules.identity.domain.audit_events import IdentityAuditEvent
from app.modules.identity.domain.entities import Membership
from app.modules.identity.domain.enums import Capability, MembershipStatus, Role
from app.modules.identity.domain.principal import PrincipalContext


class CreateMembershipUseCase:
    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo

    async def execute(
        self,
        principal: PrincipalContext,
        target_user_id: UUID,
        target_org_id: UUID,
        role: Role,
        valid_from: datetime | None = None,
        valid_until: datetime | None = None,
    ) -> Membership:
        # Authorization check: must have MANAGE_IDENTITY
        if not principal.can(Capability.MANAGE_IDENTITY):
            raise ForbiddenError("MANAGE_IDENTITY capability required to create memberships")

        now = datetime.now(timezone.utc)
        effective_valid_from = valid_from or now
        if valid_until and valid_until <= effective_valid_from:
            raise ForbiddenError("valid_until must be strictly after valid_from")

        membership = Membership(
            id=uuid.uuid4(),
            user_id=target_user_id,
            org_id=target_org_id,
            role=role,
            status=MembershipStatus.ACTIVE,
            valid_from=effective_valid_from,
            valid_until=valid_until,
            created_at=now,
            updated_at=now,
        )

        saved = await self.repo.create_membership(membership)
        await self.repo.emit_audit_event(
            event=IdentityAuditEvent.MEMBERSHIP_CREATED,
            actor_id=principal.user_id,
            resource_id=saved.id,
            payload={
                "target_user_id": str(target_user_id),
                "target_org_id": str(target_org_id),
                "role": role.value,
            },
        )
        return saved


class SuspendMembershipUseCase:
    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo

    async def execute(
        self,
        principal: PrincipalContext,
        membership_id: UUID,
        reason: str,
    ) -> None:
        if not principal.can(Capability.MANAGE_IDENTITY):
            raise ForbiddenError("MANAGE_IDENTITY capability required to suspend memberships")

        await self.repo.update_membership_status(membership_id, MembershipStatus.SUSPENDED)
        await self.repo.emit_audit_event(
            event=IdentityAuditEvent.MEMBERSHIP_SUSPENDED,
            actor_id=principal.user_id,
            resource_id=membership_id,
            payload={"reason": reason},
        )


class RevokeMembershipUseCase:
    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo

    async def execute(
        self,
        principal: PrincipalContext,
        membership_id: UUID,
        reason: str,
    ) -> None:
        if not principal.can(Capability.MANAGE_IDENTITY):
            raise ForbiddenError("MANAGE_IDENTITY capability required to revoke memberships")

        await self.repo.update_membership_status(membership_id, MembershipStatus.REVOKED)
        await self.repo.emit_audit_event(
            event=IdentityAuditEvent.MEMBERSHIP_REVOKED,
            actor_id=principal.user_id,
            resource_id=membership_id,
            payload={"reason": reason},
        )
