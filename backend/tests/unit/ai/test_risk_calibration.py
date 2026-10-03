"""
tests/unit/ai/test_risk_calibration.py — probability calibration + decision-score semantics.

Reported probability is calibrated to an ASSUMED real-world prevalence (so it is small), while
decision rules must keep using the raw model score (see RiskAssessment.decision_score).
"""

from __future__ import annotations

import uuid

import pytest

from app.modules.ai.domain.entities import RiskAssessment
from app.modules.ai.domain.enums import ModelStatus, RiskHorizon
from app.modules.ai.infrastructure.xgboost_risk_predictor import calibrate_probability
from app.modules.network.domain.enums import AccessibilityStatus
from app.workers.risk_refresh_worker import status_for_probability

CAL = {"platt_a": 1.0, "platt_b": 0.0, "sample_prevalence": 0.5, "assumed_prevalence": 0.05}


def _assessment(probability: float, raw: float | None) -> RiskAssessment:
    return RiskAssessment(edge_id=uuid.uuid4(), horizon=RiskHorizon.H24, probability=probability,
                          model_status=ModelStatus.LOADED, raw_score=raw)


class TestCalibrateProbability:
    def test_no_calibration_is_identity(self) -> None:
        assert calibrate_probability(0.6, None) == 0.6

    def test_prior_shift_lowers_probability_and_preserves_order(self) -> None:
        lo, mid, hi = (calibrate_probability(p, CAL) for p in (0.2, 0.5, 0.9))
        assert 0.0 < lo < mid < hi < 1.0
        assert mid == pytest.approx(0.05, abs=1e-6)  # balanced score maps to the assumed prevalence

    def test_extreme_inputs_stay_in_open_unit_interval(self) -> None:
        assert 0.0 < calibrate_probability(0.0, CAL) < calibrate_probability(1.0, CAL) < 1.0


class TestDecisionScore:
    def test_uses_raw_score_when_present(self) -> None:
        a = _assessment(0.10, 0.80)
        assert a.decision_score == 0.80
        assert status_for_probability(a.decision_score) is AccessibilityStatus.BLOCKED

    def test_falls_back_to_probability_without_raw(self) -> None:
        a = _assessment(0.5, None)
        assert a.decision_score == 0.5
        assert status_for_probability(a.decision_score) is AccessibilityStatus.RESTRICTED

    def test_calibrated_probability_alone_would_not_escalate(self) -> None:
        # documents WHY decisions use raw_score: a calibrated 10% is below every threshold
        assert status_for_probability(0.10) is None

    def test_rejects_out_of_range_raw_score(self) -> None:
        with pytest.raises(ValueError):
            _assessment(0.1, 1.5)
