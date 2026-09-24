"""
app/modules/coordination/api/schemas.py — Pydantic schemas for the coordination API.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.coordination.domain.enums import ActionType, InspectionStatus, SubjectType


class JurisdictionResponse(BaseModel):
    id: UUID
    code: str
    name: str
    level: str
    parent_id: UUID | None


class CoordinationActionRequest(BaseModel):
    subject_type: SubjectType
    subject_ref: str = Field(..., min_length=1, max_length=128)
    action: ActionType
    target_jurisdiction_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)


class CoordinationActionResponse(BaseModel):
    id: UUID
    subject_type: SubjectType
    subject_ref: str
    action: ActionType
    target_jurisdiction_id: UUID | None
    notes: str | None
    actor_id: UUID
    actor_role: str
    created_at: datetime


class CoordinationSummaryResponse(BaseModel):
    subject_type: SubjectType
    subject_ref: str
    acknowledged: bool
    acknowledged_at: datetime | None
    acknowledged_by: UUID | None
    escalated_to_jurisdiction_id: UUID | None
    escalated_at: datetime | None
    assigned_jurisdiction_id: UUID | None
    assigned_at: datetime | None
    inspection_status: InspectionStatus
    last_action_at: datetime
    actions: list[CoordinationActionResponse]
