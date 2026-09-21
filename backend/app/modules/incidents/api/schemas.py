"""
app/modules/incidents/api/schemas.py — Pydantic DTOs for Incidents and Adjudication.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.incidents.domain.enums import (
    IncidentLifecycle,
    ResolutionReason,
    ReviewDecisionKind,
)
from app.modules.reporting.domain.enums import RejectionReason


class EdgeImpactSpec(BaseModel):
    """Specific road edge closure impact specification."""
    edge_id: UUID
    affected_direction: str = Field(default="BOTH", pattern=r"^(BOTH|FORWARD|BACKWARD)$")
    is_full_closure: bool = True


class ReviewDecisionRequest(BaseModel):
    """Verifier adjudication submission."""
    decision: ReviewDecisionKind = Field(..., description="Adjudication outcome")
    notes: str | None = Field(None, max_length=2000, description="Audit justification notes")
    rejection_reason: RejectionReason | None = Field(None, description="Mandatory if decision is REJECT_REPORT")
    existing_incident_id: UUID | None = Field(None, description="Link observation to existing open incident")
    affected_edges: list[EdgeImpactSpec] = Field(default_factory=list, description="Affected corridor edges")
    incident_title: str | None = Field(None, max_length=255, description="Title for newly created incident")


class ReviewDecisionResponse(BaseModel):
    """Response payload for completed review decision."""
    report_id: UUID
    review_state: str
    version: int
    incident_id: UUID | None = None
    decision: str


class IncidentResponse(BaseModel):
    """Operational incident details."""
    id: UUID
    primary_report_id: UUID
    lifecycle: str
    severity: str
    title: str
    description: str
    resolution_reason: str | None = None
    resolution_notes: str | None = None
    resolved_by: UUID | None = None
    resolved_at: datetime | None = None
    reopened_reason: str | None = None
    reopened_at: datetime | None = None
    created_at: datetime
    version: int


class ResolveIncidentRequest(BaseModel):
    """Request to mark an incident as resolved."""
    reason: ResolutionReason = Field(..., description="Operational resolution justification")
    notes: str | None = Field(None, max_length=2000, description="Optional resolution audit details")
    affected_edge_ids: list[UUID] = Field(
        default_factory=list,
        description="List of road edges to safely re-evaluate for accessibility recalculation",
    )


class MergeIncidentsRequest(BaseModel):
    """Request to merge a duplicate incident into a primary target incident."""
    target_incident_id: UUID = Field(..., description="Primary incident to retain")
    notes: str | None = Field(None, max_length=2000, description="Audit notes explaining duplication")
