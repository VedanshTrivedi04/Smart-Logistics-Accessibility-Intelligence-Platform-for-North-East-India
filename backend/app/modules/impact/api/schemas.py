"""
app/modules/impact/api/schemas.py — Pydantic Schemas for Disruption Impact API.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.impact.domain.enums import (
    ImpactSeverity,
    ImpactType,
    ReachabilityState,
    RecommendedAction,
)


class EvaluateImpactRequest(BaseModel):
    edge_id: UUID
    source_status_version: int
    source_event_id: UUID
    incident_id: UUID | None = None
    impact_type: ImpactType = ImpactType.BLOCKED_ROUTE
    severity: ImpactSeverity = ImpactSeverity.HIGH
    delay_estimated_seconds: int = Field(default=1800, ge=0)


class CommitmentImpactResponse(BaseModel):
    id: UUID
    delivery_commitment_id: UUID
    trip_id: UUID
    trip_impact_id: UUID
    original_required_before: datetime
    projected_arrival: datetime
    projected_sla_status: str
    delay_seconds: int
    assessed_at: datetime


class TripImpactResponse(BaseModel):
    id: UUID
    trip_id: UUID
    incident_id: UUID | None
    edge_id: UUID
    source_event_id: UUID
    source_status_version: int
    assessment_version: int
    impact_type: ImpactType
    severity: ImpactSeverity
    delay_estimated_seconds: int
    distance_to_disruption_meters: int | None
    recommended_action: RecommendedAction
    is_active: bool
    resolved_reason: str | None
    assessed_at: datetime


class FacilityImpactResponse(BaseModel):
    id: UUID
    facility_id: UUID
    incident_id: UUID | None
    edge_id: UUID
    source_status_version: int
    reachability_state: ReachabilityState
    isolated: bool
    alternate_route_available: bool
    access_delay_seconds: int
    assessed_at: datetime


class EvaluateImpactSummaryResponse(BaseModel):
    edge_id: UUID
    trips_evaluated: int
    trips_impacted: int
    commitments_impacted: int
    facilities_impacted: int
