"""ROAD_CONDITION_UPDATE is an observation: it must never trigger automatic caution on its own."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.modules.reporting.domain.entities import FieldReport, LocationPoint
from app.modules.reporting.domain.enums import ReportSeverity, ReportType


def _report(report_type: ReportType, severity: ReportSeverity) -> FieldReport:
    now = datetime.now(UTC)
    return FieldReport(
        id=uuid.uuid4(),
        reporter_id=uuid.uuid4(),
        report_type=report_type,
        severity=severity,
        description="Debris cleared from one lane",
        location=LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=10.0),
        observed_at=now - timedelta(minutes=5),
        received_at=now,
        created_at=now,
    )


@pytest.mark.parametrize("severity", [ReportSeverity.HIGH, ReportSeverity.CRITICAL])
def test_road_condition_update_never_auto_triggers_caution(severity: ReportSeverity) -> None:
    assert not _report(ReportType.ROAD_CONDITION_UPDATE, severity).should_auto_provisional_caution(["FIELD_OFFICER"])


def test_a_real_hazard_of_the_same_severity_still_does() -> None:
    assert _report(ReportType.LANDSLIDE, ReportSeverity.CRITICAL).should_auto_provisional_caution(["FIELD_OFFICER"])
