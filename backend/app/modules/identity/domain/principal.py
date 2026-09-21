"""
app/modules/identity/domain/principal.py — PrincipalContext domain model.

Central security abstraction representing the authenticated caller and their
authorized scopes. Evaluated at every request layer.

DENY-BY-DEFAULT:
- All methods reject unless explicit matching grant or capability exists.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from app.modules.identity.domain.assignment_context import AssignmentContext
from app.modules.identity.domain.enums import Capability, OrgKind, ResourceKind, Role


@dataclass(frozen=True)
class SharingGrantContext:
    """Snapshot of an active sharing grant available to this principal."""
    owner_org_id: UUID
    resource_kind: ResourceKind
    field_names: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class PrincipalContext:
    """
    Immutable identity and authorization context for the current request.

    Constructed during Layer 3 (Principal Resolution) and passed through all
    subsequent layers.
    """
    user_id: UUID
    org_id: UUID
    org_name: str
    org_kind: OrgKind
    role: Role
    capabilities: frozenset[Capability]
    jurisdiction_ids: frozenset[UUID] = field(default_factory=frozenset)
    sharing_grants: frozenset[SharingGrantContext] = field(default_factory=frozenset)
    assignment: AssignmentContext = field(default_factory=AssignmentContext)
    session_id: UUID | None = None
    email: str | None = None
    display_name: str | None = None
    dev_mode: bool = False

    def can(self, capability: Capability) -> bool:
        """
        Deny-by-default capability check.
        Returns True if and only if capability is in self.capabilities.
        """
        return capability in self.capabilities

    def has_jurisdiction(self, jurisdiction_id: UUID) -> bool:
        """
        Check if the principal's jurisdiction scope covers the given jurisdiction.
        Platform Admin and Regional Authority with empty specific list have regional/global scope,
        otherwise requires explicit match.
        """
        if self.role == Role.PLATFORM_ADMINISTRATOR:
            return True
        return jurisdiction_id in self.jurisdiction_ids

    def has_sharing_grant(self, owner_org_id: UUID, resource_kind: str | ResourceKind) -> bool:
        """
        Check if another organization has granted data sharing for this resource kind.
        """
        kind = resource_kind.value if isinstance(resource_kind, ResourceKind) else str(resource_kind)
        for sg in self.sharing_grants:
            if sg.owner_org_id == owner_org_id and sg.resource_kind.value == kind:
                return True
        return False
