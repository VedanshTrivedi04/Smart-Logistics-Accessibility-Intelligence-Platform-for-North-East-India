"""
app/modules/network/public.py — Explicit Public Contract for the Network Module.

Other modules (Reporting, Logistics, Routing, Impact) must ONLY import from this file.
"""

from app.modules.network.application.ports import (
    EdgeStatusRepositoryPort,
    NetworkRepositoryPort,
)
from app.modules.network.domain.entities import (
    Bridge,
    EdgeRestriction,
    EdgeStatusCurrent,
    EdgeStatusEvent,
    Facility,
    NetworkVersion,
    RoadEdge,
    RoadNode,
    TraversabilityResult,
    VehicleProfile,
)
from app.modules.network.domain.enums import (
    AccessibilityStatus,
    FacilityKind,
    ReachabilityStatus,
    RestrictionKind,
    RoadClass,
    SourceEventType,
    StatusFreshness,
    StructuralCondition,
    SurfaceType,
)
from app.modules.network.domain.exceptions import (
    BridgeNotFoundError,
    CoverageGapError,
    EdgeNotFoundError,
    EdgeStatusImmutableError,
    FacilityNotFoundError,
    InvalidTopologyError,
    NetworkDomainError,
    NodeNotFoundError,
)
from app.modules.network.domain.traversability import evaluate_traversability

__all__ = [
    "AccessibilityStatus",
    "RoadClass",
    "SurfaceType",
    "RestrictionKind",
    "FacilityKind",
    "ReachabilityStatus",
    "StatusFreshness",
    "SourceEventType",
    "StructuralCondition",
    "NetworkVersion",
    "RoadNode",
    "RoadEdge",
    "Bridge",
    "EdgeRestriction",
    "Facility",
    "EdgeStatusEvent",
    "EdgeStatusCurrent",
    "VehicleProfile",
    "TraversabilityResult",
    "NetworkDomainError",
    "EdgeNotFoundError",
    "NodeNotFoundError",
    "FacilityNotFoundError",
    "BridgeNotFoundError",
    "InvalidTopologyError",
    "CoverageGapError",
    "EdgeStatusImmutableError",
    "evaluate_traversability",
    "NetworkRepositoryPort",
    "EdgeStatusRepositoryPort",
]
