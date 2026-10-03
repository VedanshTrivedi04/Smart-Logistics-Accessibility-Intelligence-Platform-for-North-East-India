"""
app/modules/identity/application/ports.py — Abstract ports for Identity application layer.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any
from uuid import UUID

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
from app.modules.identity.domain.enums import MembershipStatus, ResourceKind
from app.modules.identity.domain.principal import JurisdictionScope


class IdentityRepositoryPort(ABC):
    """Abstract persistence port for identity domain entities."""

    @abstractmethod
    async def get_user_by_id(self, user_id: UUID) -> User | None: ...

    @abstractmethod
    async def get_user_by_issuer_subject(self, issuer: str, subject: str) -> User | None: ...

    @abstractmethod
    async def upsert_user(
        self, issuer: str, subject: str, email: str | None, display_name: str
    ) -> User: ...

    @abstractmethod
    async def get_organization_by_id(self, org_id: UUID) -> Organization | None: ...

    @abstractmethod
    async def get_active_memberships_for_user(self, user_id: UUID) -> list[Membership]: ...

    @abstractmethod
    async def get_membership(self, user_id: UUID, org_id: UUID) -> Membership | None: ...

    @abstractmethod
    async def create_membership(self, membership: Membership) -> Membership: ...

    @abstractmethod
    async def update_membership_status(
        self, membership_id: UUID, status: MembershipStatus
    ) -> None: ...

    @abstractmethod
    async def create_session(self, session: Session) -> Session: ...

    @abstractmethod
    async def get_session_by_token_digest(self, digest: str) -> Session | None: ...

    @abstractmethod
    async def touch_session(self, session_id: UUID, last_seen_at: datetime) -> None: ...

    @abstractmethod
    async def revoke_session(self, session_id: UUID, reason: str) -> None: ...

    @abstractmethod
    async def revoke_all_user_sessions(self, user_id: UUID, reason: str) -> int: ...

    @abstractmethod
    async def create_csrf_token(self, csrf_token: CSRFToken) -> CSRFToken: ...

    @abstractmethod
    async def get_valid_csrf_token(self, session_id: UUID, digest: str) -> CSRFToken | None: ...

    @abstractmethod
    async def delete_csrf_tokens_for_session(self, session_id: UUID) -> None: ...

    @abstractmethod
    async def create_auth_transaction(self, tx: AuthTransaction) -> AuthTransaction: ...

    @abstractmethod
    async def get_valid_auth_transaction(self, state: str) -> AuthTransaction | None: ...

    @abstractmethod
    async def consume_auth_transaction(self, state: str) -> None: ...

    @abstractmethod
    async def get_effective_grants_for_principal(
        self, user_id: UUID, org_id: UUID
    ) -> list[Grant]: ...

    async def resolve_jurisdiction_scope(self, granted_ids: set[UUID]) -> JurisdictionScope:
        """Expand directly granted jurisdictions to their descendants. Default: no hierarchy knowledge."""
        home = sorted(granted_ids, key=str)[0] if granted_ids else None
        return JurisdictionScope(all_ids=frozenset(granted_ids), home_id=home, region_wide=False)

    @abstractmethod
    async def get_grant_by_id(self, grant_id: UUID) -> Grant | None: ...

    @abstractmethod
    async def create_grant(self, grant: Grant) -> Grant: ...

    @abstractmethod
    async def revoke_grant(self, grant_id: UUID, revoked_by: UUID, reason: str) -> None: ...

    @abstractmethod
    async def get_active_sharing_grants_for_org(
        self, recipient_org_id: UUID
    ) -> list[SharingGrant]: ...

    @abstractmethod
    async def create_sharing_grant(self, sharing_grant: SharingGrant) -> SharingGrant: ...

    @abstractmethod
    async def revoke_sharing_grant(self, grant_id: UUID) -> None: ...

    @abstractmethod
    async def get_jurisdiction_by_id(self, jurisdiction_id: UUID) -> Jurisdiction | None: ...

    @abstractmethod
    async def list_jurisdictions() -> list[Jurisdiction]: ...

    @abstractmethod
    async def emit_audit_event(
        self,
        event: IdentityAuditEvent,
        actor_id: UUID | None,
        resource_id: UUID | None,
        payload: dict[str, Any],
    ) -> None: ...


class OidcVerifierPort(ABC):
    """Abstract port for OpenID Connect identity provider interactions."""

    @abstractmethod
    async def exchange_code(
        self, code: str, code_verifier: str, redirect_uri: str
    ) -> dict[str, Any]:
        """Exchange authorization code with PKCE verifier for tokens."""
        ...

    @abstractmethod
    async def verify_id_token(
        self, id_token: str, nonce: str
    ) -> dict[str, Any]:
        """Verify signature, claims (iss, aud, exp, nbf), and nonce."""
        ...
