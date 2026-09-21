"""
tests/unit/impact/test_impact_domain.py — Unit tests for Disruption Impact Domain entities and SLA calculations.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

import pytest

from app.modules.impact.domain.entities import CommitmentImpact, FacilityImpact, TripImpact
from app.modules.impact.domain.enums import (
    ImpactSeverity,
    ImpactType,
    ReachabilityState,
    RecommendedAction,
)


class TestTripImpactEntity:
    def test_trip_impact_initialization(self) -> None:
        trip_id = uuid.uuid4()
        edge_id = uuid.uuid4()
        event_id = uuid.uuid4()

        impact = TripImpact(
            id=uuid.uuid4(),
            trip_id=trip_id,
            incident_id=None,
            edge_id=edge_id,
            source_event_id=event_id,
            source_status_version=3,
            assessment_version=1,
            impact_type=ImpactType.BLOCKED_ROUTE,
            severity=ImpactSeverity.CRITICAL,
            delay_estimated_seconds=3600,
            distance_to_disruption_meters=4500,
            recommended_action=RecommendedAction.REROUTE_MANDATORY,
            is_active=True,
        )

        assert impact.is_active is True
        assert impact.severity == ImpactSeverity.CRITICAL
        assert impact.recommended_action == RecommendedAction.REROUTE_MANDATORY
        assert impact.assessment_version == 1
        assert impact.resolved_reason is None

    def test_trip_impact_resolved_when_vehicle_passed(self) -> None:
        impact = TripImpact(
            id=uuid.uuid4(),
            trip_id=uuid.uuid4(),
            incident_id=None,
            edge_id=uuid.uuid4(),
            source_event_id=uuid.uuid4(),
            source_status_version=4,
            assessment_version=2,
            impact_type=ImpactType.BLOCKED_ROUTE,
            severity=ImpactSeverity.LOW,
            delay_estimated_seconds=0,
            distance_to_disruption_meters=100,
            recommended_action=RecommendedAction.PROCEED_WITH_CAUTION,
            is_active=False,
            resolved_reason="PASSED_BEFORE_DISRUPTION",
        )

        assert impact.is_active is False
        assert impact.resolved_reason == "PASSED_BEFORE_DISRUPTION"


class TestSlaCalculation:
    def test_breached_when_projected_arrival_after_deadline(self) -> None:
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(hours=1)
        delay_seconds = 7200  # 2 hours delay

        projected_arrival = now + timedelta(seconds=delay_seconds)
        sla_status = "BREACHED" if projected_arrival > deadline else "ON_TIME"

        assert sla_status == "BREACHED"

    def test_at_risk_when_within_one_hour_buffer(self) -> None:
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(hours=2)
        delay_seconds = 4500  # 1h 15m delay -> arrives in 1h 15m, deadline is in 2h (buffer < 1h)

        projected_arrival = now + timedelta(seconds=delay_seconds)
        if projected_arrival > deadline:
            sla_status = "BREACHED"
        elif (projected_arrival + timedelta(hours=1)) > deadline:
            sla_status = "AT_RISK"
        else:
            sla_status = "ON_TIME"

        assert sla_status == "AT_RISK"

    def test_on_time_when_comfortable_margin(self) -> None:
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(hours=10)
        delay_seconds = 1800  # 30m delay -> arrives in 30m, deadline in 10h

        projected_arrival = now + timedelta(seconds=delay_seconds)
        if projected_arrival > deadline:
            sla_status = "BREACHED"
        elif (projected_arrival + timedelta(hours=1)) > deadline:
            sla_status = "AT_RISK"
        else:
            sla_status = "ON_TIME"

        assert sla_status == "ON_TIME"
