"""
app/modules/network/domain/entities.py — Domain Entities and Value Objects for Network Module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from app.modules.network.domain.enums import (
    AccessibilityStatus,
    FacilityKind,
    RestrictionKind,
    RoadClass,
    SourceEventType,
    StatusFreshness,
    StructuralCondition,
    SurfaceType,
)


@dataclass(frozen=True)
class NetworkVersion:
    """Immutable snapshot of the road network graph."""
    id: UUID
    code: str
    name: str
    status: str  # ACTIVE | DEPRECATED | STAGING
    built_at: datetime
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RoadNode:
    """Topological road intersection or terminal point (pgRouting vertex)."""
    id: UUID
    network_version_id: UUID
    node_index: int  # 64-bit integer for pgRouting vertex ID
    lon: float
    lat: float
    elevation_m: float | None = None
    jurisdiction_id: UUID | None = None


@dataclass(frozen=True)
class RoadEdge:
    """Directed traversable road segment connecting two topological nodes."""
    id: UUID
    network_version_id: UUID
    edge_index: int  # 64-bit integer for pgRouting edge ID
    source_node_id: UUID
    target_node_id: UUID
    source_index: int  # pgRouting source vertex
    target_index: int  # pgRouting target vertex
    coordinates: list[tuple[float, float]]  # [(lon, lat), ...] LineString
    length_meters: float
    road_class: RoadClass
    surface_type: SurfaceType
    speed_limit_kmh: int
    base_seconds: float  # Traversal time in forward direction
    reverse_base_seconds: float  # Traversal time in reverse direction (-1.0 if one-way)
    road_name: str | None = None
    elevation_gain_m: float = 0.0
    gradient_percent: float = 0.0
    is_bridge: bool = False
    jurisdiction_id: UUID | None = None

    @property
    def is_one_way(self) -> bool:
        return self.reverse_base_seconds < 0.0


@dataclass(frozen=True)
class Bridge:
    """Structural asset traversed by one or more road edges."""
    id: UUID
    code: str
    name: str
    length_meters: float
    jurisdiction_id: UUID
    max_weight_tonnes: float | None = None  # None = unknown limit
    max_height_meters: float | None = None
    max_axle_load_tonnes: float | None = None
    is_single_lane: bool = False
    structural_condition: StructuralCondition = StructuralCondition.GOOD
    last_inspection_at: datetime | None = None


@dataclass(frozen=True)
class EdgeRestriction:
    """Hard physical or regulatory constraint on an edge."""
    id: UUID
    edge_id: UUID
    kind: RestrictionKind
    value_numeric: float | None = None
    unit: str | None = None  # TONNES, METERS, KMH
    direction: str = "BOTH"  # FORWARD, BACKWARD, BOTH
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    source_reference: str | None = None


@dataclass(frozen=True)
class Facility:
    """Enrolled critical point of interest requiring emergency accessibility."""
    id: UUID
    code: str
    name: str
    kind: FacilityKind
    jurisdiction_id: UUID
    lon: float
    lat: float
    nearest_road_node_id: UUID | None = None
    snap_distance_m: float | None = None
    is_critical: bool = True
    is_active: bool = True


@dataclass(frozen=True)
class EdgeStatusEvent:
    """Immutable audit record of a road status declaration."""
    id: UUID
    edge_id: UUID
    status: AccessibilityStatus
    reason: str
    source_event_type: SourceEventType
    valid_from: datetime
    created_at: datetime
    restrictions: dict[str, Any] = field(default_factory=dict)
    source_reference_id: UUID | None = None
    actor_user_id: UUID | None = None
    valid_until: datetime | None = None


@dataclass(frozen=True)
class EdgeStatusCurrent:
    """Materialized projection of current edge accessibility."""
    edge_id: UUID
    status_version: int
    status: AccessibilityStatus
    freshness: StatusFreshness
    effective_restrictions: dict[str, Any] = field(default_factory=dict)
    source_event_id: UUID | None = None
    last_verified_at: datetime | None = None
    expires_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(frozen=True)
class VehicleProfile:
    """Dimensions and cargo requirements of a transport vehicle."""
    vehicle_id: UUID | None = None
    gross_weight_tonnes: float = 12.0
    height_meters: float = 3.2
    width_meters: float = 2.4
    axle_count: int = 2
    is_heavy_vehicle: bool = False
    is_hazardous_cargo: bool = False  # e.g., Liquid Medical Oxygen, Fuel
    is_critical_dispatch: bool = False  # e.g., Emergency Life Support


@dataclass(frozen=True)
class TraversabilityResult:
    """Evaluation result of vehicle passage over an edge."""
    can_traverse: bool
    requires_review: bool = False
    reason: str = "Traversable"
    delay_penalty_seconds: float = 0.0
