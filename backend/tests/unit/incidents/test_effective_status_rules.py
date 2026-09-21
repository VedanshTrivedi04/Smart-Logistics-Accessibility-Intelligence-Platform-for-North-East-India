"""
tests/unit/incidents/test_effective_status_rules.py — Pure Domain Unit Tests for Safe Edge Recalculation.
"""

from __future__ import annotations

import uuid

import pytest

from app.modules.incidents.domain.recalculation import (
    ActiveIncidentCondition,
    recalculate_effective_edge_status,
)
from app.modules.network.domain.enums import AccessibilityStatus
from app.modules.reporting.domain.enums import ReportSeverity


class TestEffectiveStatusRules:
    def test_single_critical_incident_blocks_edge(self) -> None:
        edge_id = uuid.uuid4()
        incidents = [
            ActiveIncidentCondition(
                incident_id=uuid.uuid4(),
                severity=ReportSeverity.CRITICAL,
                is_full_closure=True,
                lifecycle="ACTIVE",
            )
        ]
        status, restrictions = recalculate_effective_edge_status(edge_id, incidents)
        assert status == AccessibilityStatus.BLOCKED
        assert any("INCIDENT_CLOSURE" in r for r in restrictions)

    def test_multiple_incidents_most_restrictive_wins(self) -> None:
        edge_id = uuid.uuid4()
        inc_1 = ActiveIncidentCondition(
            incident_id=uuid.uuid4(),
            severity=ReportSeverity.CRITICAL,
            is_full_closure=True,
            lifecycle="ACTIVE",
        )
        inc_2 = ActiveIncidentCondition(
            incident_id=uuid.uuid4(),
            severity=ReportSeverity.MEDIUM,
            is_full_closure=False,
            lifecycle="ACTIVE",
        )

        status, _ = recalculate_effective_edge_status(edge_id, [inc_1, inc_2])
        assert status == AccessibilityStatus.BLOCKED

        # Resolving the CRITICAL incident (leaving only MEDIUM) recalculates to RESTRICTED
        status_after_first_resolution, restrictions = recalculate_effective_edge_status(edge_id, [inc_2])
        assert status_after_first_resolution == AccessibilityStatus.RESTRICTED
        assert any("INCIDENT_RESTRICTION" in r for r in restrictions)

    def test_all_incidents_resolved_reopens_edge(self) -> None:
        edge_id = uuid.uuid4()
        resolved_inc = ActiveIncidentCondition(
            incident_id=uuid.uuid4(),
            severity=ReportSeverity.CRITICAL,
            is_full_closure=True,
            lifecycle="RESOLVED",
        )

        status, restrictions = recalculate_effective_edge_status(edge_id, [resolved_inc])
        assert status == AccessibilityStatus.OPEN
        assert len(restrictions) == 0

    def test_provisional_caution_rule(self) -> None:
        edge_id = uuid.uuid4()
        status, restrictions = recalculate_effective_edge_status(
            edge_id,
            active_incidents=[],
            has_provisional_caution=True,
        )
        assert status == AccessibilityStatus.PROVISIONAL_CAUTION
        assert "ACTIVE_PROVISIONAL_CAUTION" in restrictions
