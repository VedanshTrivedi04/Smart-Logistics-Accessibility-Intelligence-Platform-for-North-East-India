"""
tests/unit/reporting/test_apply_cv_verification.py — Unit Tests for ApplyCvVerificationUseCase.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from app.modules.reporting.application.apply_cv_verification import ApplyCvVerificationUseCase
from app.modules.reporting.application.ports import ReportingRepositoryPort
from app.modules.reporting.domain.entities import FieldReport, LocationPoint
from app.modules.reporting.domain.enums import ReportSeverity, ReportType, ReviewState
from app.modules.reporting.domain.exceptions import ReportNotFoundError


def make_report(**overrides: object) -> FieldReport:
    now = datetime.now(UTC)
    defaults: dict[str, object] = {
        "id": uuid.uuid4(),
        "reporter_id": uuid.uuid4(),
        "report_type": ReportType.LANDSLIDE,
        "severity": ReportSeverity.MEDIUM,
        "description": "Awaiting CV verification",
        "location": LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=15.0),
        "observed_at": now - timedelta(minutes=10),
        "received_at": now,
        "created_at": now,
        "review_state": ReviewState.SUBMITTED,
    }
    defaults.update(overrides)
    return FieldReport(**defaults)  # type: ignore[arg-type]


class TestApplyCvVerificationUseCase:
    async def test_records_cv_fields(self) -> None:
        report = make_report()
        repo = AsyncMock(spec=ReportingRepositoryPort)
        repo.get_report_by_id.return_value = report
        repo.update_report.side_effect = lambda r: r

        use_case = ApplyCvVerificationUseCase(repo)
        updated = await use_case.execute(
            report_id=report.id,
            hazard_class="LANDSLIDE",
            severity_score=0.4,
            confidence=0.5,
            is_roadway_blocked=False,
        )

        assert updated.cv_hazard_class == "LANDSLIDE"
        assert updated.cv_severity_score == 0.4
        assert updated.cv_confidence == 0.5
        assert updated.cv_is_roadway_blocked is False
        assert updated.cv_verified_at is not None
        repo.update_report.assert_awaited_once()

    async def test_escalates_to_provisional_caution_on_high_confidence_hit(self) -> None:
        report = make_report(review_state=ReviewState.SUBMITTED)
        repo = AsyncMock(spec=ReportingRepositoryPort)
        repo.get_report_by_id.return_value = report
        repo.update_report.side_effect = lambda r: r

        use_case = ApplyCvVerificationUseCase(repo)
        updated = await use_case.execute(
            report_id=report.id,
            hazard_class="LANDSLIDE",
            severity_score=0.9,
            confidence=0.95,
            is_roadway_blocked=True,
        )

        assert updated.review_state == ReviewState.PROVISIONAL_CAUTION
        assert updated.is_provisional_caution is True

    async def test_low_confidence_does_not_escalate(self) -> None:
        report = make_report(review_state=ReviewState.SUBMITTED)
        repo = AsyncMock(spec=ReportingRepositoryPort)
        repo.get_report_by_id.return_value = report
        repo.update_report.side_effect = lambda r: r

        use_case = ApplyCvVerificationUseCase(repo)
        updated = await use_case.execute(
            report_id=report.id,
            hazard_class="CLEAR_ROAD",
            severity_score=0.0,
            confidence=0.3,
            is_roadway_blocked=False,
        )

        assert updated.review_state == ReviewState.SUBMITTED
        assert updated.is_provisional_caution is False

    async def test_never_overrides_an_already_verified_report(self) -> None:
        report = make_report(review_state=ReviewState.VERIFIED)
        repo = AsyncMock(spec=ReportingRepositoryPort)
        repo.get_report_by_id.return_value = report
        repo.update_report.side_effect = lambda r: r

        use_case = ApplyCvVerificationUseCase(repo)
        updated = await use_case.execute(
            report_id=report.id,
            hazard_class="LANDSLIDE",
            severity_score=0.95,
            confidence=0.99,
            is_roadway_blocked=True,
        )

        # CV fields recorded for audit visibility, but human decision stands.
        assert updated.review_state == ReviewState.VERIFIED
        assert updated.cv_hazard_class == "LANDSLIDE"

    async def test_report_not_found_raises(self) -> None:
        repo = AsyncMock(spec=ReportingRepositoryPort)
        repo.get_report_by_id.return_value = None

        use_case = ApplyCvVerificationUseCase(repo)
        with pytest.raises(ReportNotFoundError):
            await use_case.execute(
                report_id=uuid.uuid4(),
                hazard_class="LANDSLIDE",
                severity_score=0.5,
                confidence=0.5,
                is_roadway_blocked=False,
            )
