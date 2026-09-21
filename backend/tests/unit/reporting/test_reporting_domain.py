"""
tests/unit/reporting/test_reporting_domain.py — Pure Domain Unit Tests for Field Reporting.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.modules.reporting.domain.entities import FieldReport, LocationPoint
from app.modules.reporting.domain.enums import (
    LocationProvider,
    ReportSeverity,
    ReportType,
    ReviewState,
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
        now = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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
