"""
app/modules/routing/api/schemas.py — Request & Response DTOs for Routing API.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.routing.domain.enums import DispatchAction, PolicyVersion, RouteResultStatus


class RouteEvaluationRequest(BaseModel):
    trip_id: UUID | None = None
    origin_node_id: UUID | None = None
    origin_lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    origin_lon: float | None = Field(default=None, ge=-180.0, le=180.0)
    destination_node_id: UUID | None = None
    destination_lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    destination_lon: float | None = Field(default=None, ge=-180.0, le=180.0)
    vehicle_id: UUID | None = None
    max_weight_kg: float = Field(..., gt=0.0)
    height_m: float = Field(default=3.0, gt=0.0)
    is_hazmat: bool = False
    cargo_priority: str = "TIER_3_STANDARD"
    departure_time: datetime | None = None
    policy_version: PolicyVersion = PolicyVersion.CONSERVATIVE_CRITICAL_V1


class RouteEdgeResponse(BaseModel):
    edge_id: UUID
    sequence_order: int
    cumulative_distance_meters: int
    cumulative_duration_seconds: int


class AlternativeRouteResponse(BaseModel):
    rank: int
    total_distance_meters: int
    total_duration_seconds: int
    geometry: dict[str, Any]
    edges: list[RouteEdgeResponse]


class RoutePlanResponse(BaseModel):
    id: UUID
    organization_id: UUID
    trip_id: UUID | None
    graph_version: str
    status_version: int
    policy_version: str
    result_status: RouteResultStatus
    total_distance_meters: int
    total_duration_seconds: int
    requires_human_review: bool
    excluded_edge_reasons: dict[str, list[str]]
    primary_geometry: dict[str, Any] | None
    edges: list[RouteEdgeResponse]
    alternatives: list[AlternativeRouteResponse]
    evaluated_at: datetime
    expires_at: datetime


class DispatchDecisionRequest(BaseModel):
    route_plan_id: UUID
    action: DispatchAction
    selected_alternative_rank: int = Field(default=0, ge=0)
    reason: str = Field(..., min_length=3, max_length=1000)


class DispatchDecisionResponse(BaseModel):
    id: UUID
    trip_id: UUID
    route_plan_id: UUID
    action: str
    selected_alternative_rank: int
    reason: str
    status_version_at_decision: int
    decided_at: datetime
