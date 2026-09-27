"""
app/modules/inspection/api/schemas.py — Pydantic Schemas for Inspection API.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.inspection.domain.enums import (
    DamageType,
    EvidenceKind,
    InspectionPriority,
    InspectionStatus,
    PassabilityStatus,
    StructuralStability,
)


class AssignInspectionRequest(BaseModel):
    assigned_to: UUID = Field(..., description="UUID of designated inspector")
    jurisdiction_id: UUID = Field(..., description="Jurisdiction governing the inspection corridor")
    report_id: UUID | None = Field(None, description="Linked ground field report if originating from patrol")
    candidate_edge_id: str | None = Field(None, description="Road network edge segment ID")
    incident_id: UUID | None = Field(None, description="Linked incident ID if already confirmed")
    priority: InspectionPriority = Field(InspectionPriority.MEDIUM, description="Task urgency level")
    instructions: str = Field("", description="Special directives from regional/district authority")


class TechnicalAssessmentSchema(BaseModel):
    road_condition: str = Field(..., description="e.g. 'Partial carriageway obstruction', 'Culvert breach'")
    passability: PassabilityStatus = Field(..., description="Authoritative traversability rating")
    damage_type: DamageType = Field(..., description="Technical damage taxonomy")
    stability: StructuralStability = Field(StructuralStability.STABLE, description="Ground/structural stability assessment")
    affected_length_m: float | None = Field(None, ge=0, description="Obstruction / damage length in meters")
    affected_width_m: float | None = Field(None, ge=0, description="Obstruction / damage width in meters")
    debris_depth_m: float | None = Field(None, ge=0, description="Depth of silt/boulders on tarmac")
    bridge_pier_scour_depth_m: float | None = Field(None, ge=0, description="Bridge pier scour depth in meters")
    water_level_over_road_cm: float | None = Field(None, ge=0, description="Standing or flowing water depth")
    slope_movement_detected: bool | None = Field(None, description="Active hillside slippage indicator")
    heavy_vehicle_passable: bool = Field(False, description="Can heavy commercial trucks negotiate the section")
    recommended_speed_limit_kmh: int | None = Field(None, ge=0, le=120, description="Recommended safe speed limit")
    technical_notes: str = Field("", description="Detailed engineering remarks")
    raw_measurements: dict[str, Any] = Field(default_factory=dict, description="Flexible parameters per damage type")


class InspectionEvidenceCreateSchema(BaseModel):
    media_id: UUID = Field(..., description="UUID of pre-uploaded media object in media_objects")
    kind: EvidenceKind = Field(EvidenceKind.WIDE_ANGLE, description="Evidence category")
    caption: str | None = Field(None, description="Caption or description")
    latitude: float | None = Field(None, description="Geotagged latitude")
    longitude: float | None = Field(None, description="Geotagged longitude")
    altitude_m: float | None = Field(None, description="Elevation in meters")
    azimuth_deg: float | None = Field(None, description="Compass heading direction")


class InspectionEvidenceResponse(BaseModel):
    id: UUID
    media_id: UUID
    kind: EvidenceKind
    caption: str | None
    latitude: float | None
    longitude: float | None
    altitude_m: float | None
    azimuth_deg: float | None
    captured_at: datetime


class SubmitAssessmentRequest(BaseModel):
    assessment: TechnicalAssessmentSchema
    evidence: list[InspectionEvidenceCreateSchema] = Field(default_factory=list)


class DecideInspectionRequest(BaseModel):
    decision: str = Field(..., description="Outcome: VERIFIED, REJECTED, REINSPECTION_REQUIRED, CLEARANCE_RESTORED")
    notes: str | None = Field(None, description="Reasoning and official remarks")
    rejection_reason: str | None = Field(None, description="Required if decision is REJECTED")
    affected_edges: list[list[Any]] | None = Field(None, description="List of [edge_id, direction, is_full_closure]")


class InspectionResponse(BaseModel):
    id: UUID
    jurisdiction_id: UUID
    assigned_to: UUID
    assigned_by: UUID
    priority: InspectionPriority
    status: InspectionStatus
    instructions: str
    report_id: UUID | None = None
    incident_id: UUID | None = None
    candidate_edge_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    final_decision: str | None = None
    decision_notes: str | None = None
    assessment: TechnicalAssessmentSchema | None = None
    evidence: list[InspectionEvidenceResponse] = Field(default_factory=list)


class InspectionStatsResponse(BaseModel):
    counts: dict[str, int]


class InspectorSummaryResponse(BaseModel):
    user_id: UUID
    display_name: str
    email: str | None
    org_name: str
