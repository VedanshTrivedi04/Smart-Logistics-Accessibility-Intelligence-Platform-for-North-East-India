"""
tests/unit/coordination/test_coordination_rules.py — Validation and state derivation for coordination actions.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.modules.coordination.domain.entities import CoordinationAction
from app.modules.coordination.domain.enums import ActionType, InspectionStatus, SubjectType
from app.modules.coordination.domain.exceptions import InvalidCoordinationActionError
from app.modules.coordination.domain.rules import (
    normalize_notes,
    summarize_all,
    summarize_subject,
    validate_action,
    validate_against_history,
)

T0 = datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc)
STATE_A = uuid4()
STATE_B = uuid4()
ACTOR = uuid4()


def act(action: ActionType, minutes: int, *, target=None, ref="inc-1", subject=SubjectType.INCIDENT, notes=None) -> CoordinationAction:
    return CoordinationAction(
        id=uuid4(),
        subject_type=subject,
        subject_ref=ref,
        action=action,
        target_jurisdiction_id=target,
        notes=notes,
        actor_id=ACTOR,
        actor_role="REGIONAL_AUTHORITY",
        created_at=T0 + timedelta(minutes=minutes),
    )


def check(action: ActionType, *, target=None, notes=None, subject=SubjectType.INCIDENT, ref="inc-1") -> None:
    validate_action(subject_type=subject, subject_ref=ref, action=action, target_jurisdiction_id=target, notes=notes)


class TestValidateAction:
    def test_acknowledge_needs_nothing(self) -> None:
        check(ActionType.ACKNOWLEDGE)

    def test_escalate_needs_target_and_note(self) -> None:
        with pytest.raises(InvalidCoordinationActionError):
            check(ActionType.ESCALATE, notes="Road closed for days")
        with pytest.raises(InvalidCoordinationActionError):
            check(ActionType.ESCALATE, target=STATE_A)
        with pytest.raises(InvalidCoordinationActionError):
            check(ActionType.ESCALATE, target=STATE_A, notes="ab")
        check(ActionType.ESCALATE, target=STATE_A, notes="Road closed for days")

    def test_assign_needs_target_but_not_note(self) -> None:
        with pytest.raises(InvalidCoordinationActionError):
            check(ActionType.ASSIGN)
        check(ActionType.ASSIGN, target=STATE_A)

    def test_acknowledge_rejects_target(self) -> None:
        with pytest.raises(InvalidCoordinationActionError):
            check(ActionType.ACKNOWLEDGE, target=STATE_A)

    def test_note_needs_text(self) -> None:
        with pytest.raises(InvalidCoordinationActionError):
            check(ActionType.NOTE)
        check(ActionType.NOTE, notes="Spoke to district office")

    def test_inspection_request_target_is_optional(self) -> None:
        check(ActionType.REQUEST_INSPECTION)
        check(ActionType.REQUEST_INSPECTION, target=STATE_A)

    @pytest.mark.parametrize("subject", [SubjectType.ALERT, SubjectType.TRIP])
    def test_inspection_only_for_incident_or_facility(self, subject: SubjectType) -> None:
        with pytest.raises(InvalidCoordinationActionError):
            check(ActionType.REQUEST_INSPECTION, subject=subject)
        with pytest.raises(InvalidCoordinationActionError):
            check(ActionType.INSPECTION_COMPLETE, subject=subject)

    def test_facility_can_be_inspected(self) -> None:
        check(ActionType.REQUEST_INSPECTION, subject=SubjectType.FACILITY)

    def test_blank_or_overlong_reference_rejected(self) -> None:
        with pytest.raises(InvalidCoordinationActionError):
            check(ActionType.ACKNOWLEDGE, ref="  ")
        with pytest.raises(InvalidCoordinationActionError):
            check(ActionType.ACKNOWLEDGE, ref="x" * 129)

    def test_overlong_notes_rejected(self) -> None:
        with pytest.raises(InvalidCoordinationActionError):
            check(ActionType.NOTE, notes="x" * 2001)

    def test_normalize_notes(self) -> None:
        assert normalize_notes(None) is None
        assert normalize_notes("   ") is None
        assert normalize_notes("  hello  ") == "hello"


class TestValidateAgainstHistory:
    def test_cannot_complete_without_request(self) -> None:
        with pytest.raises(InvalidCoordinationActionError):
            validate_against_history(ActionType.INSPECTION_COMPLETE, [])
        with pytest.raises(InvalidCoordinationActionError):
            validate_against_history(ActionType.INSPECTION_COMPLETE, [act(ActionType.ACKNOWLEDGE, 0)])

    def test_can_complete_after_request(self) -> None:
        validate_against_history(ActionType.INSPECTION_COMPLETE, [act(ActionType.REQUEST_INSPECTION, 0)])

    def test_cannot_complete_twice(self) -> None:
        history = [act(ActionType.REQUEST_INSPECTION, 0), act(ActionType.INSPECTION_COMPLETE, 1)]
        with pytest.raises(InvalidCoordinationActionError):
            validate_against_history(ActionType.INSPECTION_COMPLETE, history)

    def test_cannot_request_twice_while_pending(self) -> None:
        with pytest.raises(InvalidCoordinationActionError):
            validate_against_history(ActionType.REQUEST_INSPECTION, [act(ActionType.REQUEST_INSPECTION, 0)])

    def test_can_request_again_after_completion(self) -> None:
        history = [act(ActionType.REQUEST_INSPECTION, 0), act(ActionType.INSPECTION_COMPLETE, 1)]
        validate_against_history(ActionType.REQUEST_INSPECTION, history)


class TestSummarize:
    def test_empty_is_an_error(self) -> None:
        with pytest.raises(ValueError):
            summarize_subject([])

    def test_note_only_leaves_everything_unset(self) -> None:
        s = summarize_subject([act(ActionType.NOTE, 0, notes="Looking into it")])
        assert not s.acknowledged
        assert s.escalated_to_jurisdiction_id is None
        assert s.assigned_jurisdiction_id is None
        assert s.inspection_status is InspectionStatus.NOT_REQUESTED

    def test_full_lifecycle(self) -> None:
        s = summarize_subject(
            [
                act(ActionType.ACKNOWLEDGE, 0),
                act(ActionType.ESCALATE, 1, target=STATE_A, notes="Needs state action"),
                act(ActionType.ASSIGN, 2, target=STATE_A),
                act(ActionType.REQUEST_INSPECTION, 3),
                act(ActionType.INSPECTION_COMPLETE, 4),
            ]
        )
        assert s.acknowledged and s.acknowledged_by == ACTOR
        assert s.escalated_to_jurisdiction_id == STATE_A
        assert s.assigned_jurisdiction_id == STATE_A
        assert s.inspection_status is InspectionStatus.COMPLETED
        assert s.last_action_at == T0 + timedelta(minutes=4)

    def test_latest_of_each_kind_wins_regardless_of_input_order(self) -> None:
        s = summarize_subject(
            [
                act(ActionType.ASSIGN, 5, target=STATE_B),
                act(ActionType.ASSIGN, 1, target=STATE_A),
            ]
        )
        assert s.assigned_jurisdiction_id == STATE_B
        assert [a.created_at for a in s.actions] == sorted(a.created_at for a in s.actions)

    def test_new_inspection_cycle_after_completion(self) -> None:
        s = summarize_subject(
            [act(ActionType.REQUEST_INSPECTION, 0), act(ActionType.INSPECTION_COMPLETE, 1), act(ActionType.REQUEST_INSPECTION, 2)]
        )
        assert s.inspection_status is InspectionStatus.REQUESTED

    def test_stray_completion_without_request_is_ignored(self) -> None:
        s = summarize_subject([act(ActionType.INSPECTION_COMPLETE, 0)])
        assert s.inspection_status is InspectionStatus.NOT_REQUESTED

    def test_summarize_all_groups_by_subject_and_sorts_by_recency(self) -> None:
        summaries = summarize_all(
            [
                act(ActionType.ACKNOWLEDGE, 0, ref="inc-1"),
                act(ActionType.ACKNOWLEDGE, 9, ref="inc-2"),
                act(ActionType.NOTE, 5, ref="inc-1", notes="Follow up"),
                act(ActionType.ACKNOWLEDGE, 3, ref="inc-1", subject=SubjectType.ALERT),
            ]
        )
        assert [(s.subject_type, s.subject_ref) for s in summaries] == [
            (SubjectType.INCIDENT, "inc-2"),
            (SubjectType.INCIDENT, "inc-1"),
            (SubjectType.ALERT, "inc-1"),
        ]
        assert len(summaries[1].actions) == 2
