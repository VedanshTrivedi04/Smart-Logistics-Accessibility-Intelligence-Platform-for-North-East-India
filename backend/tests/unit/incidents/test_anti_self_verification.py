"""
tests/unit/incidents/test_anti_self_verification.py — Pure Domain Unit Tests for Anti-Self-Verification.
"""

from __future__ import annotations

import uuid

import pytest

from app.modules.incidents.domain.entities import ReviewDecision
from app.modules.incidents.domain.enums import ReviewDecisionKind
from app.modules.incidents.domain.exceptions import SelfVerificationForbiddenError


class TestAntiSelfVerification:
    def test_reporter_reviewing_own_report_raises_error(self) -> None:
        user_id = uuid.uuid4()
        report_id = uuid.uuid4()

        decision = ReviewDecision(
            id=uuid.uuid4(),
            report_id=report_id,
            reviewer_id=user_id,
            decision=ReviewDecisionKind.CONFIRM_INCIDENT,
        )

        with pytest.raises(SelfVerificationForbiddenError, match="cannot review report"):
            decision.validate_anti_self_verification(reporter_id=user_id)

    def test_different_reviewer_passes_validation(self) -> None:
        reporter_id = uuid.uuid4()
        verifier_id = uuid.uuid4()
        report_id = uuid.uuid4()

        decision = ReviewDecision(
            id=uuid.uuid4(),
            report_id=report_id,
            reviewer_id=verifier_id,
            decision=ReviewDecisionKind.CONFIRM_INCIDENT,
        )

        # Should not raise
        decision.validate_anti_self_verification(reporter_id=reporter_id)
