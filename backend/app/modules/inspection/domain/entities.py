"""
app/modules/inspection/domain/entities.py — Domain Entities for Inspection Module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.modules.inspection.domain.enums import (
    DamageType,
    EvidenceKind,
    InspectionPriority,
    InspectionStatus,
    PassabilityStatus,
    StructuralStability,
)
from app.modules.inspection.domain.exceptions import (
    InspectionStateError,
    InspectionValidationError,
)


@dataclass
class TechnicalAssessment:
    """Quantitative engineering and physical measurements recorded during inspection."""
    road_condition: str
    passability: PassabilityStatus
    damage_type: DamageType
    stability: StructuralStability = StructuralStability.STABLE
    affected_length_m: float | None = None
    affected_width_m: float | None = None
    debris_depth_m: float | None = None
    bridge_pier_scour_depth_m: float | None = None
    water_level_over_road_cm: float | None = None
    slope_movement_detected: bool | None = None
    heavy_vehicle_passable: bool = False
    recommended_speed_limit_kmh: int | None = None
    technical_notes: str = ""
    raw_measurements: dict[str, Any] = field(default_factory=dict)

    def validate(self) -> None:
        if self.affected_length_m is not None and self.affected_length_m < 0:
            raise InspectionValidationError("Affected length cannot be negative")
        if self.affected_width_m is not None and self.affected_width_m < 0:
            raise InspectionValidationError("Affected width cannot be negative")
        if self.debris_depth_m is not None and self.debris_depth_m < 0:
            raise InspectionValidationError("Debris depth cannot be negative")


@dataclass
class InspectionEvidence:
    """Categorized visual or geospatial evidence linked to an inspection."""
    id: UUID
    inspection_id: UUID
    media_id: UUID
    kind: EvidenceKind
    caption: str | None = None
    captured_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    latitude: float | None = None
    longitude: float | None = None
    altitude_m: float | None = None
    azimuth_deg: float | None = None


@dataclass
class Inspection:
    """Authoritative physical inspection task dispatched to an engineer/inspector."""
    id: UUID
    jurisdiction_id: UUID
    assigned_to: UUID
    assigned_by: UUID
    priority: InspectionPriority
    status: InspectionStatus
    instructions: str
    created_at: datetime
    updated_at: datetime
    report_id: UUID | None = None
    incident_id: UUID | None = None
    candidate_edge_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    assessment: TechnicalAssessment | None = None
    evidence: list[InspectionEvidence] = field(default_factory=list)
    final_decision: str | None = None
    decision_notes: str | None = None

    def start(self, inspector_id: UUID) -> None:
        """Mark inspection in-progress by the assigned inspector."""
        if self.assigned_to != inspector_id:
            raise InspectionStateError("Only the assigned inspector can start this inspection")
        if self.status not in (InspectionStatus.ASSIGNED, InspectionStatus.REINSPECTION_REQUIRED):
            raise InspectionStateError(f"Cannot start inspection in {self.status.value} status")
        self.status = InspectionStatus.IN_PROGRESS
        self.started_at = datetime.now(UTC)
        self.updated_at = datetime.now(UTC)

    def complete(self, decision: str, notes: str | None) -> None:
        """Mark inspection completed with an authoritative decision."""
        if self.status != InspectionStatus.IN_PROGRESS:
            raise InspectionStateError(f"Cannot complete inspection in {self.status.value} status")
        self.status = InspectionStatus.COMPLETED
        self.completed_at = datetime.now(UTC)
        self.final_decision = decision
        self.decision_notes = notes
        self.updated_at = datetime.now(UTC)

    def mark_reinspection_required(self, notes: str | None) -> None:
        """Flag inspection as requiring a follow-up visit/clearance check."""
        self.status = InspectionStatus.REINSPECTION_REQUIRED
        self.decision_notes = notes
        self.updated_at = datetime.now(UTC)


@dataclass(frozen=True)
class InspectorSummary:
    """Enough to populate an "assign to" dropdown; not the full user record."""

    user_id: UUID
    display_name: str
    email: str | None
    org_name: str
