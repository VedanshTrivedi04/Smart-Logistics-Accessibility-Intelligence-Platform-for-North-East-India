"""
app/modules/coordination/domain/rules.py — Validation and state derivation. Pure Python.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from app.modules.coordination.domain.entities import CoordinationAction
from app.modules.coordination.domain.enums import ActionType, InspectionStatus, SubjectType
from app.modules.coordination.domain.exceptions import InvalidCoordinationActionError

MIN_NOTE_LENGTH = 5
MAX_NOTE_LENGTH = 2000
MAX_SUBJECT_REF_LENGTH = 128

_TARGET_REQUIRED = frozenset({ActionType.ESCALATE, ActionType.ASSIGN})
_TARGET_OPTIONAL = frozenset({ActionType.REQUEST_INSPECTION})
_NOTES_REQUIRED = frozenset({ActionType.ESCALATE, ActionType.NOTE})
# An inspection concerns a road, which only an incident (or a facility's access road) has.
_INSPECTION_SUBJECTS = frozenset({SubjectType.INCIDENT, SubjectType.FACILITY})


def normalize_notes(notes: str | None) -> str | None:
    if notes is None:
        return None
    stripped = notes.strip()
    return stripped or None


def validate_action(
    *,
    subject_type: SubjectType,
    subject_ref: str,
    action: ActionType,
    target_jurisdiction_id: UUID | None,
    notes: str | None,
) -> None:
    """Raises InvalidCoordinationActionError when the combination is not allowed. `notes` must already be normalized."""
    if not subject_ref or not subject_ref.strip():
        raise InvalidCoordinationActionError("A subject reference is required.")
    if len(subject_ref) > MAX_SUBJECT_REF_LENGTH:
        raise InvalidCoordinationActionError(f"Subject reference is longer than {MAX_SUBJECT_REF_LENGTH} characters.")
    if action in _TARGET_REQUIRED and target_jurisdiction_id is None:
        raise InvalidCoordinationActionError(f"{action.value} needs a target jurisdiction.")
    if action not in _TARGET_REQUIRED and action not in _TARGET_OPTIONAL and target_jurisdiction_id is not None:
        raise InvalidCoordinationActionError(f"{action.value} does not take a target jurisdiction.")
    if action in _NOTES_REQUIRED and (notes is None or len(notes) < MIN_NOTE_LENGTH):
        raise InvalidCoordinationActionError(f"{action.value} needs a note of at least {MIN_NOTE_LENGTH} characters.")
    if notes is not None and len(notes) > MAX_NOTE_LENGTH:
        raise InvalidCoordinationActionError(f"Notes are longer than {MAX_NOTE_LENGTH} characters.")
    if action in (ActionType.REQUEST_INSPECTION, ActionType.INSPECTION_COMPLETE) and subject_type not in _INSPECTION_SUBJECTS:
        raise InvalidCoordinationActionError(f"{action.value} applies to incidents and facilities only.")


def validate_against_history(action: ActionType, history: list[CoordinationAction]) -> None:
    """Rejects actions that make no sense given what has already been recorded for the subject."""
    status = summarize_subject(history).inspection_status if history else InspectionStatus.NOT_REQUESTED
    if action is ActionType.INSPECTION_COMPLETE and status is not InspectionStatus.REQUESTED:
        raise InvalidCoordinationActionError("No inspection is pending, so there is nothing to complete.")
    if action is ActionType.REQUEST_INSPECTION and status is InspectionStatus.REQUESTED:
        raise InvalidCoordinationActionError("An inspection is already pending for this subject.")


@dataclass(frozen=True)
class SubjectSummary:
    """Current coordination state of one subject, derived from its action log."""
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
    actions: tuple[CoordinationAction, ...] = field(default_factory=tuple)


def summarize_subject(actions: list[CoordinationAction]) -> SubjectSummary:
    """
    Derives state from one subject's actions. The latest action of each kind wins.
    Requesting an inspection after a completed one starts a new cycle.
    """
    if not actions:
        raise ValueError("summarize_subject needs at least one action")
    ordered = sorted(actions, key=lambda a: (a.created_at, str(a.id)))

    ack = esc = asg = None
    inspection = InspectionStatus.NOT_REQUESTED
    for a in ordered:
        if a.action is ActionType.ACKNOWLEDGE:
            ack = a
        elif a.action is ActionType.ESCALATE:
            esc = a
        elif a.action is ActionType.ASSIGN:
            asg = a
        elif a.action is ActionType.REQUEST_INSPECTION:
            inspection = InspectionStatus.REQUESTED
        elif a.action is ActionType.INSPECTION_COMPLETE and inspection is InspectionStatus.REQUESTED:
            inspection = InspectionStatus.COMPLETED

    first = ordered[0]
    return SubjectSummary(
        subject_type=first.subject_type,
        subject_ref=first.subject_ref,
        acknowledged=ack is not None,
        acknowledged_at=ack.created_at if ack else None,
        acknowledged_by=ack.actor_id if ack else None,
        escalated_to_jurisdiction_id=esc.target_jurisdiction_id if esc else None,
        escalated_at=esc.created_at if esc else None,
        assigned_jurisdiction_id=asg.target_jurisdiction_id if asg else None,
        assigned_at=asg.created_at if asg else None,
        inspection_status=inspection,
        last_action_at=ordered[-1].created_at,
        actions=tuple(ordered),
    )


def summarize_all(actions: list[CoordinationAction]) -> list[SubjectSummary]:
    """Groups actions by subject and summarizes each, most recently active first."""
    grouped: dict[tuple[SubjectType, str], list[CoordinationAction]] = defaultdict(list)
    for a in actions:
        grouped[(a.subject_type, a.subject_ref)].append(a)
    summaries = [summarize_subject(v) for v in grouped.values()]
    return sorted(summaries, key=lambda s: s.last_action_at, reverse=True)
