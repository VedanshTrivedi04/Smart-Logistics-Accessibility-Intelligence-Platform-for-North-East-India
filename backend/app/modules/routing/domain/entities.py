"""
app/modules/routing/domain/entities.py — Pure Domain Entities for Routing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from app.modules.routing.domain.enums import (
    DispatchAction,
    PolicyVersion,
    RouteResultStatus,
)

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


@dataclass(frozen=True)
class VehicleConstraints:
    vehicle_id: UUID | None
    max_weight_kg: float
    height_m: float
    is_hazmat: bool
    cargo_priority: str  # TIER_1_CRITICAL, TIER_2_ESSENTIAL, TIER_3_STANDARD
    departure_time: datetime


@dataclass(frozen=True)
class ConstraintEvaluationResult:
    allowed: bool
    reasons: list[str]
    penalty_multiplier: float = 1.0


@dataclass(frozen=True)
class RouteEdge:
    edge_id: UUID
    sequence_order: int
    cumulative_distance_meters: int
    cumulative_duration_seconds: int
    is_alternative: bool = False
    alternative_rank: int = 0
    # Populated for turn-by-turn directions (see evaluate_route.py); optional because
    # older persisted route plans (read back via get_route_plan) predate these fields.
    road_name: str | None = None
    geometry: dict[str, Any] | None = None


@dataclass(frozen=True)
class AlternativeRoute:
    rank: int
    edges: list[RouteEdge]
    total_distance_meters: int
    total_duration_seconds: int
    risk_penalty_score: float
    geometry_geojson: dict[str, Any]


@dataclass
class RoutePlan:
    id: UUID
    organization_id: UUID
    trip_id: UUID | None
    network_version_id: UUID
    graph_version: str
    status_version: int
    policy_version: PolicyVersion
    origin_node_id: UUID
    destination_node_id: UUID
    result_status: RouteResultStatus
    total_distance_meters: int
    total_duration_seconds: int
    risk_penalty_score: float
    requires_human_review: bool
    excluded_edge_reasons: dict[str, list[str]]
    primary_geometry: dict[str, Any] | None  # GeoJSON dict
    alternative_geometries: list[dict[str, Any]]
    edges: list[RouteEdge]
    alternatives: list[AlternativeRoute]
    # Vehicle constraints snapshot
    vehicle_id: UUID | None
    vehicle_weight_kg: float
    vehicle_height_m: float
    is_hazmat: bool
    cargo_priority: str
    departure_time: datetime
    evaluated_at: datetime
    expires_at: datetime
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class DispatchDecision:
    id: UUID
    trip_id: UUID
    route_plan_id: UUID
    actor_id: UUID
    action: DispatchAction
    selected_alternative_rank: int
    reason: str
    status_version_at_decision: int
    decided_at: datetime
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def is_in_curfew(
    departure_time: datetime,
    accumulated_seconds: int,
    curfew_start_time: time,
    curfew_end_time: time,
) -> bool:
    """
    Evaluates whether arrival at edge falls within a curfew window in Asia/Kolkata timezone.
    Supports overnight curfews (e.g. 22:00 to 06:00).
    """
    # Convert departure to Asia/Kolkata
    dep_kolkata = departure_time.astimezone(KOLKATA_TZ)
    # Add travel seconds
    arrival_kolkata = dep_kolkata.timestamp() + accumulated_seconds
    arrival_dt = datetime.fromtimestamp(arrival_kolkata, tz=KOLKATA_TZ)
    arrival_time = arrival_dt.time()

    if curfew_start_time > curfew_end_time:
        # Overnight curfew (e.g. 22:00 to 06:00)
        return arrival_time >= curfew_start_time or arrival_time < curfew_end_time
    else:
        # Same-day curfew (e.g. 08:00 to 12:00)
        return curfew_start_time <= arrival_time < curfew_end_time
