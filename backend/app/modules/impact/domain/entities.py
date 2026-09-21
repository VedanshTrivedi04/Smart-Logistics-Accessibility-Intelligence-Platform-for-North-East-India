"""
app/modules/impact/domain/entities.py — Domain Entities for Disruption Impact Assessment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

from app.modules.impact.domain.enums import (
    ImpactSeverity,
    ImpactType,
    ReachabilityState,
    RecommendedAction,
)


@dataclass
class TripImpact:
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
    is_active: bool = True
    resolved_reason: str | None = None
    assessed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class CommitmentImpact:
    id: UUID
    delivery_commitment_id: UUID
    trip_id: UUID
    trip_impact_id: UUID
    original_required_before: datetime
    projected_arrival: datetime
    projected_sla_status: str  # ON_TIME, AT_RISK, BREACHED
    delay_seconds: int
    assessed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class FacilityImpact:
    id: UUID
    facility_id: UUID
    incident_id: UUID | None
    edge_id: UUID
    source_status_version: int
    reachability_state: ReachabilityState
    isolated: bool
    alternate_route_available: bool
    access_delay_seconds: int
    assessed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
