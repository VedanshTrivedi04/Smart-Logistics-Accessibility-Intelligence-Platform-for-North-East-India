"""
app/modules/identity/domain/entities.py — Domain entity representations for Identity module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from app.modules.identity.domain.enums import (
    Capability,
    GrantScopeType,
    JurisdictionLevel,
    MembershipStatus,
    OrgKind,
    ResourceKind,
    Role,
)


@dataclass
class User:
    id: UUID
    issuer: str
    subject: str
    email: str | None
    display_name: str
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class Organization:
    id: UUID
    code: str
    name: str
    kind: OrgKind
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class Membership:
    id: UUID
    user_id: UUID
    org_id: UUID
    role: Role
    status: MembershipStatus = MembershipStatus.ACTIVE
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def is_effective(self, now: datetime) -> bool:
        """Return True if membership is active and within effective dates."""
        if self.status != MembershipStatus.ACTIVE:
            return False
        if self.valid_from and self.valid_from > now:
            return False
        if self.valid_until and self.valid_until <= now:
            return False
        return True


@dataclass
class Jurisdiction:
    id: UUID
    code: str
    name: str
    level: JurisdictionLevel
    parent_id: UUID | None = None
    created_at: datetime | None = None


@dataclass
class Grant:
    id: UUID
    grantor_user_id: UUID
    grantor_org_id: UUID
    scope_type: GrantScopeType
    grantee_user_id: UUID | None = None
    grantee_org_id: UUID | None = None
    capabilities: tuple[Capability, ...] = field(default_factory=tuple)
    jurisdiction_ids: tuple[UUID, ...] = field(default_factory=tuple)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    is_active: bool = True
    revoked_at: datetime | None = None
    revoked_by: UUID | None = None
    revocation_reason: str | None = None
    created_at: datetime | None = None

    def is_effective(self, now: datetime) -> bool:
        """Return True if grant is active and not expired or future."""
        if not self.is_active:
            return False
        if self.valid_from and self.valid_from > now:
            return False
        if self.valid_until and self.valid_until <= now:
            return False
        return True


@dataclass
class SharingGrant:
    id: UUID
    owner_org_id: UUID
    recipient_org_id: UUID
    resource_kind: ResourceKind
    field_names: tuple[str, ...] = field(default_factory=tuple)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    is_active: bool = True
    created_at: datetime | None = None

    def is_effective(self, now: datetime) -> bool:
        if not self.is_active:
            return False
        if self.valid_from and self.valid_from > now:
            return False
        if self.valid_until and self.valid_until <= now:
            return False
        return True


@dataclass
class Session:
    id: UUID
    user_id: UUID
    org_id: UUID
    role: Role
    token_digest: str  # HMAC-SHA256 hex (Fix 1)
    ip_address: str | None
    user_agent: str | None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    revocation_reason: str | None = None

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    def is_expired(self, now: datetime, idle_timeout_minutes: int) -> bool:
        """Check absolute expiration and idle timeout."""
        if self.is_revoked:
            return True
        if self.expires_at <= now:
            return True
        from datetime import timedelta
        if self.last_seen_at + timedelta(minutes=idle_timeout_minutes) < now:
            return True
        return False


@dataclass
class CSRFToken:
    id: UUID
    session_id: UUID
    token_digest: str  # HMAC-SHA256 hex
    created_at: datetime
    expires_at: datetime

    def is_valid(self, now: datetime) -> bool:
        return self.expires_at > now


@dataclass
class AuthTransaction:
    id: UUID
    state: str
    nonce: str
    code_verifier: str
    ip_address: str | None
    created_at: datetime
    expires_at: datetime
    consumed_at: datetime | None = None

    @property
    def is_consumed(self) -> bool:
        return self.consumed_at is not None

    def is_valid(self, now: datetime) -> bool:
        return not self.is_consumed and self.expires_at > now
