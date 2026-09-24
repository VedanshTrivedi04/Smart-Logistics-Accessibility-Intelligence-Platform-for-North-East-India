"""
app/modules/coordination/domain/entities.py — Coordination action entity.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.modules.coordination.domain.enums import ActionType, SubjectType


@dataclass(frozen=True)
class CoordinationAction:
    """One immutable, append-only coordination record."""
    id: UUID
    subject_type: SubjectType
    subject_ref: str
    action: ActionType
    target_jurisdiction_id: UUID | None
    notes: str | None
    actor_id: UUID
    actor_role: str
    created_at: datetime


@dataclass(frozen=True)
class Jurisdiction:
    id: UUID
    code: str
    name: str
    level: str
    parent_id: UUID | None
