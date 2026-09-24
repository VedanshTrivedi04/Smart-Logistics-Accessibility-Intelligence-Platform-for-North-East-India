"""
tests/unit/workers/test_risk_refresh_worker.py — Unit Tests for Pure Risk-Refresh Logic.

Only the pure, DB-free parts of app/workers/risk_refresh_worker.py are unit
tested here (status_for_probability, the severity ordering table). The full
refresh_edge_risks() pass requires a live database (real edges, weather
features, and status projections) — see
tests/integration/ai/test_risk_refresh_worker.py for that coverage.
"""

from __future__ import annotations

from app.modules.network.domain.enums import AccessibilityStatus
from app.workers.risk_refresh_worker import (
    _STATUS_SEVERITY,
    BLOCKED_THRESHOLD,
    RESTRICTED_THRESHOLD,
    status_for_probability,
)


class TestStatusForProbability:
    def test_below_restricted_threshold_returns_none(self) -> None:
        assert status_for_probability(RESTRICTED_THRESHOLD - 0.01) is None

    def test_at_restricted_threshold_returns_restricted(self) -> None:
        assert status_for_probability(RESTRICTED_THRESHOLD) is AccessibilityStatus.RESTRICTED

    def test_between_thresholds_returns_restricted(self) -> None:
        midpoint = (RESTRICTED_THRESHOLD + BLOCKED_THRESHOLD) / 2
        assert status_for_probability(midpoint) is AccessibilityStatus.RESTRICTED

    def test_at_blocked_threshold_returns_blocked(self) -> None:
        assert status_for_probability(BLOCKED_THRESHOLD) is AccessibilityStatus.BLOCKED

    def test_above_blocked_threshold_returns_blocked(self) -> None:
        assert status_for_probability(1.0) is AccessibilityStatus.BLOCKED

    def test_zero_probability_returns_none(self) -> None:
        assert status_for_probability(0.0) is None


class TestStatusSeverityOrdering:
    def test_open_is_least_severe(self) -> None:
        open_severity = _STATUS_SEVERITY[AccessibilityStatus.OPEN]
        restricted_severity = _STATUS_SEVERITY[AccessibilityStatus.RESTRICTED]
        assert open_severity < restricted_severity

    def test_blocked_is_most_severe(self) -> None:
        blocked_severity = _STATUS_SEVERITY[AccessibilityStatus.BLOCKED]
        restricted_severity = _STATUS_SEVERITY[AccessibilityStatus.RESTRICTED]
        assert blocked_severity > restricted_severity

    def test_thresholds_are_strictly_ordered(self) -> None:
        assert 0.0 < RESTRICTED_THRESHOLD < BLOCKED_THRESHOLD < 1.0
