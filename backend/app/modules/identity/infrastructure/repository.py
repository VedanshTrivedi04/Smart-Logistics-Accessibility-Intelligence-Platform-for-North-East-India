"""
app/modules/identity/infrastructure/repository.py — SQLAlchemy repository implementation.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.modules.identity.application.ports import IdentityRepositoryPort
from app.modules.identity.domain.audit_events import IdentityAuditEvent
from app.modules.identity.domain.entities import (
    AuthTransaction,
    CSRFToken,
    Grant,
    Jurisdiction,
    Membership,
    Organization,
    Session,
    SharingGrant,
    User,
)
from app.modules.identity.domain.enums import (
    Capability,
    GrantScopeType,
    JurisdictionLevel,
    MembershipStatus,
    OrgKind,
    ResourceKind,
    Role,
)
from app.modules.identity.infrastructure.models import (
    AuthTransactionModel,
    CSRFTokenModel,
    GrantModel,
    JurisdictionModel,
    MembershipModel,
    OrganizationModel,
    SessionModel,
    SharingGrantModel,
    UserModel,
)

logger = get_logger(__name__)


class SqlAlchemyIdentityRepository(IdentityRepositoryPort):
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Users ────────────────────────────────────────────────────────
    async def get_user_by_id(self, user_id: UUID) -> User | None:
        stmt = select(UserModel).where(UserModel.id == user_id)
        res = await self.session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_user_entity(model) if model else None

    async def get_user_by_issuer_subject(self, issuer: str, subject: str) -> User | None:
        stmt = select(UserModel).where(UserModel.issuer == issuer, UserModel.subject == subject)
        res = await self.session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_user_entity(model) if model else None

    async def upsert_user(
        self, issuer: str, subject: str, email: str | None, display_name: str
    ) -> User:
        # Check existing first for cross-dialect compatibility (Postgres / SQLite)
        existing = await self.get_user_by_issuer_subject(issuer, subject)
        if existing:
            stmt = (
                update(UserModel)
                .where(UserModel.id == existing.id)
                .values(email=email, display_name=display_name, updated_at=func.now())
                .returning(UserModel)
            )
            res = await self.session.execute(stmt)
            model = res.scalar_one()
            return self._to_user_entity(model)

        model = UserModel(
            id=uuid.uuid4(),
            issuer=issuer,
            subject=subject,
            email=email,
            display_name=display_name,
            is_active=True,
        )
        self.session.add(model)
        await self.session.flush()
        return self._to_user_entity(model)

    # ── Organizations ────────────────────────────────────────────────
    async def get_organization_by_id(self, org_id: UUID) -> Organization | None:
        stmt = select(OrganizationModel).where(OrganizationModel.id == org_id)
        res = await self.session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_org_entity(model) if model else None

    # ── Memberships ──────────────────────────────────────────────────
    async def get_active_memberships_for_user(self, user_id: UUID) -> list[Membership]:
        stmt = select(MembershipModel).where(
            MembershipModel.user_id == user_id,
            MembershipModel.status == MembershipStatus.ACTIVE.value,
        )
        res = await self.session.execute(stmt)
        return [self._to_membership_entity(m) for m in res.scalars().all()]

    async def get_membership(self, user_id: UUID, org_id: UUID) -> Membership | None:
        stmt = select(MembershipModel).where(
            MembershipModel.user_id == user_id,
            MembershipModel.org_id == org_id,
        )
        res = await self.session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_membership_entity(model) if model else None

    async def create_membership(self, membership: Membership) -> Membership:
        model = MembershipModel(
            id=membership.id,
            user_id=membership.user_id,
            org_id=membership.org_id,
            role=membership.role.value,
            status=membership.status.value,
            valid_from=membership.valid_from or func.now(),
            valid_until=membership.valid_until,
        )
        self.session.add(model)
        await self.session.flush()
        return self._to_membership_entity(model)

    async def update_membership_status(
        self, membership_id: UUID, status: MembershipStatus
    ) -> None:
        stmt = (
            update(MembershipModel)
            .where(MembershipModel.id == membership_id)
            .values(status=status.value, updated_at=func.now())
        )
        await self.session.execute(stmt)
        await self.session.flush()

    # ── Sessions ─────────────────────────────────────────────────────
    async def create_session(self, session: Session) -> Session:
        model = SessionModel(
            id=session.id,
            user_id=session.user_id,
            org_id=session.org_id,
            role=session.role.value,
            token_digest=session.token_digest,
            ip_address=session.ip_address,
            user_agent=session.user_agent,
            created_at=session.created_at,
            last_seen_at=session.last_seen_at,
            expires_at=session.expires_at,
        )
        self.session.add(model)
        await self.session.flush()
        return self._to_session_entity(model)

    async def get_session_by_token_digest(self, digest: str) -> Session | None:
        stmt = select(SessionModel).where(SessionModel.token_digest == digest)
        res = await self.session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_session_entity(model) if model else None

    async def touch_session(self, session_id: UUID, last_seen_at: datetime) -> None:
        stmt = (
            update(SessionModel)
            .where(SessionModel.id == session_id)
            .values(last_seen_at=last_seen_at)
        )
        await self.session.execute(stmt)
        await self.session.flush()

    async def revoke_session(self, session_id: UUID, reason: str) -> None:
        now = datetime.now(timezone.utc)
        stmt = (
            update(SessionModel)
            .where(SessionModel.id == session_id)
            .values(revoked_at=now, revocation_reason=reason)
        )
        await self.session.execute(stmt)
        await self.session.flush()

    async def revoke_all_user_sessions(self, user_id: UUID, reason: str) -> int:
        now = datetime.now(timezone.utc)
        stmt = (
            update(SessionModel)
            .where(SessionModel.user_id == user_id, SessionModel.revoked_at.is_(None))
            .values(revoked_at=now, revocation_reason=reason)
        )
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.rowcount

    # ── CSRF Tokens ──────────────────────────────────────────────────
    async def create_csrf_token(self, csrf_token: CSRFToken) -> CSRFToken:
        model = CSRFTokenModel(
            id=csrf_token.id,
            session_id=csrf_token.session_id,
            token_digest=csrf_token.token_digest,
            created_at=csrf_token.created_at,
            expires_at=csrf_token.expires_at,
        )
        self.session.add(model)
        await self.session.flush()
        return self._to_csrf_entity(model)

    async def get_valid_csrf_token(self, session_id: UUID, digest: str) -> CSRFToken | None:
        now = datetime.now(timezone.utc)
        stmt = select(CSRFTokenModel).where(
            CSRFTokenModel.session_id == session_id,
            CSRFTokenModel.token_digest == digest,
            CSRFTokenModel.expires_at > now,
        )
        res = await self.session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_csrf_entity(model) if model else None

    async def delete_csrf_tokens_for_session(self, session_id: UUID) -> None:
        stmt = delete(CSRFTokenModel).where(CSRFTokenModel.session_id == session_id)
        await self.session.execute(stmt)
        await self.session.flush()

    # ── Auth Transactions ────────────────────────────────────────────
    async def create_auth_transaction(self, tx: AuthTransaction) -> AuthTransaction:
        model = AuthTransactionModel(
            id=tx.id,
            state=tx.state,
            nonce=tx.nonce,
            code_verifier=tx.code_verifier,
            ip_address=tx.ip_address,
            created_at=tx.created_at,
            expires_at=tx.expires_at,
        )
        self.session.add(model)
        await self.session.flush()
        return self._to_auth_tx_entity(model)

    async def get_valid_auth_transaction(self, state: str) -> AuthTransaction | None:
        now = datetime.now(timezone.utc)
        stmt = select(AuthTransactionModel).where(
            AuthTransactionModel.state == state,
            AuthTransactionModel.consumed_at.is_(None),
            AuthTransactionModel.expires_at > now,
        )
        res = await self.session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_auth_tx_entity(model) if model else None

    async def consume_auth_transaction(self, state: str) -> None:
        now = datetime.now(timezone.utc)
        stmt = (
            update(AuthTransactionModel)
            .where(AuthTransactionModel.state == state)
            .values(consumed_at=now)
        )
        await self.session.execute(stmt)
        await self.session.flush()

    # ── Grants ───────────────────────────────────────────────────────
    async def get_effective_grants_for_principal(
        self, user_id: UUID, org_id: UUID
    ) -> list[Grant]:
        stmt = select(GrantModel).where(
            GrantModel.is_active == True,
            GrantModel.revoked_at.is_(None),
            or_(
                GrantModel.grantee_user_id == user_id,
                GrantModel.grantee_org_id == org_id,
            ),
        )
        res = await self.session.execute(stmt)
        return [self._to_grant_entity(m) for m in res.scalars().all()]

    async def get_grant_by_id(self, grant_id: UUID) -> Grant | None:
        stmt = select(GrantModel).where(GrantModel.id == grant_id)
        res = await self.session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_grant_entity(model) if model else None

    async def create_grant(self, grant: Grant) -> Grant:
        model = GrantModel(
            id=grant.id,
            grantor_user_id=grant.grantor_user_id,
            grantor_org_id=grant.grantor_org_id,
            grantee_user_id=grant.grantee_user_id,
            grantee_org_id=grant.grantee_org_id,
            scope_type=grant.scope_type.value,
            capabilities=[c.value for c in grant.capabilities],
            jurisdiction_ids=[str(j) for j in grant.jurisdiction_ids],
            valid_from=grant.valid_from or func.now(),
            valid_until=grant.valid_until,
            is_active=grant.is_active,
            created_at=grant.created_at or func.now(),
        )
        self.session.add(model)
        await self.session.flush()
        return self._to_grant_entity(model)

    async def revoke_grant(self, grant_id: UUID, revoked_by: UUID, reason: str) -> None:
        now = datetime.now(timezone.utc)
        stmt = (
            update(GrantModel)
            .where(GrantModel.id == grant_id)
            .values(
                is_active=False,
                revoked_at=now,
                revoked_by=revoked_by,
                revocation_reason=reason,
            )
        )
        await self.session.execute(stmt)
        await self.session.flush()

    # ── Sharing Grants ───────────────────────────────────────────────
    async def get_active_sharing_grants_for_org(
        self, recipient_org_id: UUID
    ) -> list[SharingGrant]:
        stmt = select(SharingGrantModel).where(
            SharingGrantModel.recipient_org_id == recipient_org_id,
            SharingGrantModel.is_active == True,
        )
        res = await self.session.execute(stmt)
        return [self._to_sharing_grant_entity(m) for m in res.scalars().all()]

    async def create_sharing_grant(self, sharing_grant: SharingGrant) -> SharingGrant:
        model = SharingGrantModel(
            id=sharing_grant.id,
            owner_org_id=sharing_grant.owner_org_id,
            recipient_org_id=sharing_grant.recipient_org_id,
            resource_kind=sharing_grant.resource_kind.value,
            field_names=list(sharing_grant.field_names),
            valid_from=sharing_grant.valid_from or func.now(),
            valid_until=sharing_grant.valid_until,
            is_active=sharing_grant.is_active,
            created_at=sharing_grant.created_at or func.now(),
        )
        self.session.add(model)
        await self.session.flush()
        return self._to_sharing_grant_entity(model)

    async def revoke_sharing_grant(self, grant_id: UUID) -> None:
        stmt = (
            update(SharingGrantModel)
            .where(SharingGrantModel.id == grant_id)
            .values(is_active=False)
        )
        await self.session.execute(stmt)
        await self.session.flush()

    # ── Jurisdictions ────────────────────────────────────────────────
    async def get_jurisdiction_by_id(self, jurisdiction_id: UUID) -> Jurisdiction | None:
        stmt = select(JurisdictionModel).where(JurisdictionModel.id == jurisdiction_id)
        res = await self.session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_jurisdiction_entity(model) if model else None

    async def list_jurisdictions(self) -> list[Jurisdiction]:
        stmt = select(JurisdictionModel)
        res = await self.session.execute(stmt)
        return [self._to_jurisdiction_entity(m) for m in res.scalars().all()]

    # ── Audit Events (Outbox Pattern) ────────────────────────────────
    async def emit_audit_event(
        self,
        event: IdentityAuditEvent,
        actor_id: UUID | None,
        resource_id: UUID | None,
        payload: dict[str, Any],
    ) -> None:
        logger.info(
            "identity_audit_event",
            event=event.value,
            actor_id=str(actor_id) if actor_id else None,
            resource_id=str(resource_id) if resource_id else None,
            payload=payload,
        )

    # ── Entity Mappers ───────────────────────────────────────────────
    def _to_user_entity(self, m: UserModel) -> User:
        return User(
            id=m.id,
            issuer=m.issuer,
            subject=m.subject,
            email=m.email,
            display_name=m.display_name,
            is_active=m.is_active,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )

    def _to_org_entity(self, m: OrganizationModel) -> Organization:
        return Organization(
            id=m.id,
            code=m.code,
            name=m.name,
            kind=OrgKind(m.kind),
            is_active=m.is_active,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )

    def _to_membership_entity(self, m: MembershipModel) -> Membership:
        return Membership(
            id=m.id,
            user_id=m.user_id,
            org_id=m.org_id,
            role=Role(m.role),
            status=MembershipStatus(m.status),
            valid_from=m.valid_from,
            valid_until=m.valid_until,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )

    def _to_session_entity(self, m: SessionModel) -> Session:
        return Session(
            id=m.id,
            user_id=m.user_id,
            org_id=m.org_id,
            role=Role(m.role),
            token_digest=m.token_digest,
            ip_address=m.ip_address,
            user_agent=m.user_agent,
            created_at=m.created_at,
            last_seen_at=m.last_seen_at,
            expires_at=m.expires_at,
            revoked_at=m.revoked_at,
            revocation_reason=m.revocation_reason,
        )

    def _to_csrf_entity(self, m: CSRFTokenModel) -> CSRFToken:
        return CSRFToken(
            id=m.id,
            session_id=m.session_id,
            token_digest=m.token_digest,
            created_at=m.created_at,
            expires_at=m.expires_at,
        )

    def _to_auth_tx_entity(self, m: AuthTransactionModel) -> AuthTransaction:
        return AuthTransaction(
            id=m.id,
            state=m.state,
            nonce=m.nonce,
            code_verifier=m.code_verifier,
            ip_address=m.ip_address,
            created_at=m.created_at,
            expires_at=m.expires_at,
            consumed_at=m.consumed_at,
        )

    def _to_grant_entity(self, m: GrantModel) -> Grant:
        return Grant(
            id=m.id,
            grantor_user_id=m.grantor_user_id,
            grantor_org_id=m.grantor_org_id,
            grantee_user_id=m.grantee_user_id,
            grantee_org_id=m.grantee_org_id,
            scope_type=GrantScopeType(m.scope_type),
            capabilities=tuple(Capability(c) for c in m.capabilities),
            jurisdiction_ids=tuple(UUID(j) for j in m.jurisdiction_ids),
            valid_from=m.valid_from,
            valid_until=m.valid_until,
            is_active=m.is_active,
            revoked_at=m.revoked_at,
            revoked_by=m.revoked_by,
            revocation_reason=m.revocation_reason,
            created_at=m.created_at,
        )

    def _to_sharing_grant_entity(self, m: SharingGrantModel) -> SharingGrant:
        return SharingGrant(
            id=m.id,
            owner_org_id=m.owner_org_id,
            recipient_org_id=m.recipient_org_id,
            resource_kind=ResourceKind(m.resource_kind),
            field_names=tuple(m.field_names),
            valid_from=m.valid_from,
            valid_until=m.valid_until,
            is_active=m.is_active,
            created_at=m.created_at,
        )

    def _to_jurisdiction_entity(self, m: JurisdictionModel) -> Jurisdiction:
        return Jurisdiction(
            id=m.id,
            code=m.code,
            name=m.name,
            level=JurisdictionLevel(m.level),
            parent_id=m.parent_id,
            created_at=m.created_at,
        )
