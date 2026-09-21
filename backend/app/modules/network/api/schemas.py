"""
app/modules/network/api/schemas.py — Pydantic DTOs for GIS, Network & Facility Endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.network.domain.enums import AccessibilityStatus, FacilityKind


class DeclareEdgeStatusRequest(BaseModel):
    """Request DTO for authorized road closure or caution declaration."""
    status: AccessibilityStatus = Field(..., description="Target accessibility state")
    reason: str = Field(..., min_length=3, max_length=1000, description="Justification or evidence rationale")
    restrictions: dict[str, Any] = Field(default_factory=dict, description="Active height, weight or convoy limits")
    valid_until: datetime | None = Field(None, description="Optional expiry timestamp; None = indefinite")


class EdgeDetailResponse(BaseModel):
    """Detailed response for a single road edge."""
    id: UUID
    edge_index: int
    road_class: str
    road_name: str | None
    surface_type: str
    speed_limit_kmh: int
    length_meters: float
    base_seconds: float
    is_one_way: bool
    is_bridge: bool
    status: str
    freshness: str
    status_version: int
    restrictions: list[dict[str, Any]]
    coordinates: list[tuple[float, float]]


class FacilityResponse(BaseModel):
    """Response DTO for an enrolled critical facility."""
    id: UUID
    code: str
    name: str
    kind: FacilityKind
    jurisdiction_id: UUID
    lon: float
    lat: float
    is_critical: bool
    is_active: bool
    nearest_road_node_id: UUID | None = None
    snap_distance_m: float | None = None


class ReachabilityResponse(BaseModel):
    """Response DTO for facility reachability analysis."""
    facility_id: str
    facility_name: str
    status: str
    reason: str
    origin_hub_id: str | None = None
    origin_hub_name: str | None = None
    total_seconds: float | None = None
    edge_count: int | None = None
    bottlenecks: list[dict[str, Any]] = Field(default_factory=list)
    path: list[dict[str, Any]] | None = None


class NetworkVersionResponse(BaseModel):
    """Response DTO for a network graph snapshot version."""
    id: UUID
    code: str
    name: str
    status: str
    built_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)
