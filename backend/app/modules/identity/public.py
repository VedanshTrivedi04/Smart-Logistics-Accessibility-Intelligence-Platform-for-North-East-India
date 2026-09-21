"""
app/modules/identity/public.py — Public module contract for Identity.

Other operational modules (Reporting, GIS, Routing, Fleet, Impact) must ONLY import
from this module or app.core.security, never from internal identity implementation details.
"""

from __future__ import annotations

from typing import Any

from app.modules.identity.application.check_capability import (
    CapabilityCheckRequest,
    CheckCapabilityUseCase,
    enforce_capability,
)
from app.modules.identity.domain.assignment_context import AssignmentContext
from app.modules.identity.domain.enums import (
    Capability,
    GrantScopeType,
    JurisdictionLevel,
    MembershipStatus,
    OrgKind,
    ResourceKind,
    Role,
)
from app.modules.identity.domain.principal import PrincipalContext, SharingGrantContext
from app.modules.identity.domain.role_capabilities import ROLE_CAPABILITY_MAP, get_role_baseline_capabilities


def __getattr__(name: str) -> Any:
    if name in ("require_authenticated", "require_capability"):
        import app.core.security as sec
        return getattr(sec, name)
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


__all__ = [
    "AssignmentContext",
    "Capability",
    "CapabilityCheckRequest",
    "CheckCapabilityUseCase",
    "GrantScopeType",
    "JurisdictionLevel",
    "MembershipStatus",
    "OrgKind",
    "PrincipalContext",
    "ROLE_CAPABILITY_MAP",
    "ResourceKind",
    "Role",
    "SharingGrantContext",
    "enforce_capability",
    "get_role_baseline_capabilities",
    "require_authenticated",
    "require_capability",
]
