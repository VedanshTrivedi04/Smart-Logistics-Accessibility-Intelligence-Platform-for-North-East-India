"""
tests/unit/reporting/test_reporting_domain.py — Pure Domain Unit Tests for Field Reporting.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.modules.reporting.domain.entities import FieldReport, LocationPoint
from app.modules.reporting.domain.enums import (
    LocationProvider,
    ReportSeverity,
    ReportType,
)
from app.modules.reporting.domain.exceptions import (
    ClockSkewError,
)


class TestLocationPointValidation:
    def test_valid_location_point_succeeds(self) -> None:
        pt = LocationPoint(
            longitude=91.75,
            latitude=26.15,
            accuracy_m=10.0,
            location_provider=LocationProvider.GPS_HARDWARE,
        )
        pt.validate()
        assert not pt.is_low_accuracy

    def test_longitude_outside_ner_bounds_raises_error(self) -> None:
        pt = LocationPoint(
            longitude=77.20,  # Delhi longitude
            latitude=26.15,
            accuracy_m=10.0,
        )
        with pytest.raises(ValueError, match="Longitude 77.2 is outside North-Eastern Region"):
            pt.validate()

    def test_latitude_outside_ner_bounds_raises_error(self) -> None:
        pt = LocationPoint(
            longitude=92.00,
            latitude=13.08,  # Chennai latitude
            accuracy_m=10.0,
        )
        with pytest.raises(ValueError, match="Latitude 13.08 is outside North-Eastern Region"):
            pt.validate()

    def test_negative_or_zero_accuracy_raises_error(self) -> None:
        pt = LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=0.0)
        with pytest.raises(ValueError, match="accuracy must be > 0"):
            pt.validate()

    def test_excessive_accuracy_raises_error(self) -> None:
        pt = LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=5500.0)
        with pytest.raises(ValueError, match="exceeds max 5000m"):
            pt.validate()

    def test_low_accuracy_flag(self) -> None:
        pt = LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=650.0)
        assert pt.is_low_accuracy


class TestReportTimestampAndCautionPolicy:
    def test_future_observation_raises_clock_skew_error(self) -> None:
        now = datetime.now(UTC)
        future_obs = now + timedelta(minutes=25)  # 25 min in future (> 15 min limit)

        report = FieldReport(
            id=uuid.uuid4(),
            reporter_id=uuid.uuid4(),
            report_type=ReportType.LANDSLIDE,
            severity=ReportSeverity.HIGH,
            description="Future slide report",
            location=LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=10.0),
            observed_at=future_obs,
            received_at=now,
            created_at=now,
        )
        with pytest.raises(ClockSkewError):
            report.validate_timestamps()

    def test_stale_observation_detected(self) -> None:
        now = datetime.now(UTC)
        stale_obs = now - timedelta(days=9)  # 9 days old

        report = FieldReport(
            id=uuid.uuid4(),
            reporter_id=uuid.uuid4(),
            report_type=ReportType.LANDSLIDE,
            severity=ReportSeverity.HIGH,
            description="Stale slide report",
            location=LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=10.0),
            observed_at=stale_obs,
            received_at=now,
            created_at=now,
        )
        assert report.is_stale_observation
        # Stale reports should NOT auto-trigger provisional caution
        assert not report.should_auto_provisional_caution(["FIELD_OFFICER"])

    def test_policy_21_auto_provisional_caution_triggers_for_field_officer(self) -> None:
        now = datetime.now(UTC)
        report = FieldReport(
            id=uuid.uuid4(),
            reporter_id=uuid.uuid4(),
            report_type=ReportType.LANDSLIDE,
            severity=ReportSeverity.HIGH,
            description="Active landslide blocking both lanes",
            location=LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=15.0),
            observed_at=now - timedelta(minutes=10),
            received_at=now,
            created_at=now,
        )
        assert report.should_auto_provisional_caution(["FIELD_OFFICER"])

    def test_low_severity_does_not_trigger_auto_caution(self) -> None:
        now = datetime.now(UTC)
        report = FieldReport(
            id=uuid.uuid4(),
            reporter_id=uuid.uuid4(),
            report_type=ReportType.LANDSLIDE,
            severity=ReportSeverity.LOW,
            description="Small gravel spill on shoulder",
            location=LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=15.0),
            observed_at=now - timedelta(minutes=10),
            received_at=now,
            created_at=now,
        )
        assert not report.should_auto_provisional_caution(["FIELD_OFFICER"])

    def test_unauthorized_role_does_not_trigger_auto_caution(self) -> None:
        now = datetime.now(UTC)
        report = FieldReport(
            id=uuid.uuid4(),
            reporter_id=uuid.uuid4(),
            report_type=ReportType.LANDSLIDE,
            severity=ReportSeverity.HIGH,
            description="Slide report from citizen/driver",
            location=LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=15.0),
            observed_at=now - timedelta(minutes=10),
            received_at=now,
            created_at=now,
        )
        assert not report.should_auto_provisional_caution(["TRANSPORT_OPERATOR"])


def make_report_for_cv(**overrides: object) -> FieldReport:
    now = datetime.now(UTC)
    defaults: dict[str, object] = {
        "id": uuid.uuid4(),
        "reporter_id": uuid.uuid4(),
        "report_type": ReportType.LANDSLIDE,
        "severity": ReportSeverity.MEDIUM,
        "description": "Report awaiting CV verification",
        "location": LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=15.0),
        "observed_at": now - timedelta(minutes=10),
        "received_at": now,
        "created_at": now,
    }
    defaults.update(overrides)
    return FieldReport(**defaults)  # type: ignore[arg-type]


class TestCvAutoProvisionalCaution:
    def test_high_confidence_blocked_triggers_caution(self) -> None:
        report = make_report_for_cv(cv_confidence=0.9, cv_is_roadway_blocked=True)
        assert report.should_auto_provisional_caution_from_cv()

    def test_low_confidence_does_not_trigger(self) -> None:
        report = make_report_for_cv(cv_confidence=0.5, cv_is_roadway_blocked=True)
        assert not report.should_auto_provisional_caution_from_cv()

    def test_high_confidence_but_not_blocked_does_not_trigger(self) -> None:
        report = make_report_for_cv(cv_confidence=0.95, cv_is_roadway_blocked=False)
        assert not report.should_auto_provisional_caution_from_cv()

    def test_no_cv_result_yet_does_not_trigger(self) -> None:
        report = make_report_for_cv()
        assert not report.should_auto_provisional_caution_from_cv()

    def test_stale_observation_does_not_trigger_even_with_high_confidence(self) -> None:
        now = datetime.now(UTC)
        report = make_report_for_cv(
            observed_at=now - timedelta(days=9),
            received_at=now,
            cv_confidence=0.99,
            cv_is_roadway_blocked=True,
        )
        assert not report.should_auto_provisional_caution_from_cv()

    def test_custom_threshold_respected(self) -> None:
        report = make_report_for_cv(cv_confidence=0.6, cv_is_roadway_blocked=True)
        assert report.should_auto_provisional_caution_from_cv(confidence_threshold=0.5)
        assert not report.should_auto_provisional_caution_from_cv(confidence_threshold=0.7)
