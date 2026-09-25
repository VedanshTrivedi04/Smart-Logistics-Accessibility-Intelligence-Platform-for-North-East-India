"""
tests/unit/reporting/test_report_passability.py — Reporter-observed passability fields
(lane status, vehicle classes, life-safety flag) flow through batch sync and are stored.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.modules.reporting.application.submit_report import SubmitFieldReportUseCase
from app.modules.reporting.application.sync_reports import SyncReportsBatchUseCase
from app.modules.reporting.domain.entities import FieldReport, LocationPoint
from app.modules.reporting.domain.enums import (
    LaneStatus,
    PassableVehicleClass,
    ReportSeverity,
    ReportType,
    RoadSide,
)


class FakeReportingRepo:
    """Minimal in-memory stand-in for ReportingRepositoryPort."""

    def __init__(self) -> None:
        self.reports: list[FieldReport] = []
        self.sync_results: dict[tuple[uuid.UUID, str], Any] = {}

    async def get_sync_result(self, reporter_id: uuid.UUID, client_op_id: str) -> Any:
        return self.sync_results.get((reporter_id, client_op_id))

    async def save_sync_result(self, rec: Any) -> None:
        self.sync_results[(rec.reporter_id, rec.client_operation_id)] = rec

    async def find_by_client_operation_id(self, reporter_id: uuid.UUID, client_op_id: str) -> None:
        return None

    async def find_candidate_edges(self, **_: Any) -> list[dict[str, Any]]:
        return []

    async def find_candidate_bridges(self, **_: Any) -> list[dict[str, Any]]:
        return []

    async def get_media_by_id(self, _mid: uuid.UUID) -> None:
        return None

    async def create_report(self, report: FieldReport) -> FieldReport:
        self.reports.append(report)
        return report


class _NestedTx:
    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, *_: Any) -> bool:
        return False


def _principal() -> Any:
    return SimpleNamespace(
        user_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        jurisdiction_ids=frozenset(),
        home_jurisdiction_id=None,
        role=SimpleNamespace(name="FIELD_OFFICER"),
    )


def _item(**extra: Any) -> dict[str, Any]:
    return {
        "client_operation_id": str(uuid.uuid4()),
        "report_type": "LANDSLIDE",
        "severity": "HIGH",
        "description": "Rocks on carriageway",
        "location": {"longitude": 91.75, "latitude": 26.15, "accuracy_m": 15.0, "location_provider": "GPS_HARDWARE"},
        "observed_at": (datetime.now(UTC) - timedelta(minutes=5)).isoformat(),
        "media_ids": [],
        **extra,
    }


def _use_case(repo: FakeReportingRepo) -> SyncReportsBatchUseCase:
    session = MagicMock()
    session.begin_nested = lambda: _NestedTx()
    return SyncReportsBatchUseCase(session, repo, SubmitFieldReportUseCase(repo))  # type: ignore[arg-type]


class TestPassabilityDefaults:
    def test_new_fields_default_to_unknown(self) -> None:
        now = datetime.now(UTC)
        report = FieldReport(
            id=uuid.uuid4(),
            reporter_id=uuid.uuid4(),
            report_type=ReportType.OBSTRUCTION,
            severity=ReportSeverity.MEDIUM,
            description="Convoy stalled",
            location=LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=15.0),
            observed_at=now,
            received_at=now,
            created_at=now,
        )
        assert report.lane_status is None
        assert report.passable_classes == []
        assert report.life_safety_risk is False
        assert report.road_side is None


class TestBatchSyncPassability:
    async def test_structured_fields_are_stored(self) -> None:
        repo = FakeReportingRepo()
        result = await _use_case(repo).execute(
            _principal(),
            [_item(lane_status="SINGLE_LANE_OPEN", passable_classes=["LIGHT_4X4", "EMERGENCY_ONLY"], life_safety_risk=True)],
        )
        assert result["succeeded_count"] == 1
        stored = repo.reports[0]
        assert stored.lane_status is LaneStatus.SINGLE_LANE_OPEN
        assert stored.passable_classes == [PassableVehicleClass.LIGHT_4X4, PassableVehicleClass.EMERGENCY_ONLY]
        assert stored.life_safety_risk is True

    async def test_items_without_the_fields_still_sync(self) -> None:
        repo = FakeReportingRepo()
        result = await _use_case(repo).execute(_principal(), [_item()])
        assert result["succeeded_count"] == 1
        stored = repo.reports[0]
        assert stored.lane_status is None
        assert stored.passable_classes == []
        assert stored.life_safety_risk is False

    async def test_duplicate_vehicle_classes_are_collapsed(self) -> None:
        repo = FakeReportingRepo()
        await _use_case(repo).execute(_principal(), [_item(passable_classes=["HEAVY_TRUCK", "HEAVY_TRUCK"])])
        assert repo.reports[0].passable_classes == [PassableVehicleClass.HEAVY_TRUCK]

    @pytest.mark.parametrize(
        "extra",
        [{"lane_status": "HALF_OPEN"}, {"passable_classes": ["BICYCLE"]}],
    )
    async def test_unknown_values_fail_that_item_only(self, extra: dict[str, Any]) -> None:
        repo = FakeReportingRepo()
        result = await _use_case(repo).execute(_principal(), [_item(**extra), _item(lane_status="CLEAR")])
        assert result["succeeded_count"] == 1
        assert result["failed_count"] == 1
        assert len(repo.reports) == 1

    async def test_obstruction_is_an_accepted_report_type(self) -> None:
        repo = FakeReportingRepo()
        result = await _use_case(repo).execute(_principal(), [_item(report_type="OBSTRUCTION")])
        assert result["succeeded_count"] == 1
        assert repo.reports[0].report_type is ReportType.OBSTRUCTION

    async def test_road_side_and_altitude_are_stored(self) -> None:
        repo = FakeReportingRepo()
        loc = {"longitude": 91.75, "latitude": 26.15, "accuracy_m": 12.0, "location_provider": "GPS_HARDWARE", "altitude_m": 1420.5}
        result = await _use_case(repo).execute(
            _principal(),
            [_item(location=loc, road_side="HILLSIDE")],
        )
        assert result["succeeded_count"] == 1
        stored = repo.reports[0]
        assert stored.road_side is RoadSide.HILLSIDE
        assert stored.location.altitude_m == 1420.5

