"""
tests/unit/ai/test_auto_triage_report.py — Unit Tests for AutoTriageFieldReportUseCase.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import NotFoundError
from app.core.storage import ObjectStoragePort
from app.modules.ai.application.auto_triage_report import AutoTriageFieldReportUseCase
from app.modules.ai.application.ports import HazardVerifierPort
from app.modules.ai.domain.entities import HazardVerification
from app.modules.ai.domain.enums import HazardClass, ModelStatus
from app.modules.ai.domain.exceptions import MediaObjectUnavailableError
from app.modules.reporting.domain.entities import FieldReport, LocationPoint, MediaObject
from app.modules.reporting.domain.enums import ReportSeverity, ReportType, ScanStatus
from app.modules.reporting.public import ReportingModulePort


def make_report(report_id: uuid.UUID, media_ids: list[uuid.UUID] | None = None) -> FieldReport:
    now = datetime.now(UTC)
    return FieldReport(
        id=report_id,
        reporter_id=uuid.uuid4(),
        report_type=ReportType.LANDSLIDE,
        severity=ReportSeverity.MEDIUM,
        description="Report with photo",
        location=LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=15.0),
        observed_at=now - timedelta(minutes=10),
        received_at=now,
        created_at=now,
        media_ids=media_ids or [uuid.uuid4()],
    )


def make_media(**overrides: object) -> MediaObject:
    defaults: dict[str, object] = {
        "id": uuid.uuid4(),
        "uploader_id": uuid.uuid4(),
        "bucket": "ner-media-clean",
        "object_key": "clean/2026/09/photo.jpg",
        "file_name": "photo.jpg",
        "file_size_bytes": 12345,
        "mime_type": "image/jpeg",
        "checksum_sha256": "a" * 64,
        "scan_status": ScanStatus.CLEAN,
    }
    defaults.update(overrides)
    return MediaObject(**defaults)  # type: ignore[arg-type]


def make_verification(**overrides: object) -> HazardVerification:
    defaults: dict[str, object] = {
        "hazard_detected": True,
        "hazard_class": HazardClass.LANDSLIDE,
        "severity_score": 0.8,
        "is_roadway_blocked": True,
        "confidence": 0.9,
        "model_status": ModelStatus.LOADED,
    }
    defaults.update(overrides)
    return HazardVerification(**defaults)  # type: ignore[arg-type]


class TestAutoTriageFieldReportUseCase:
    async def test_full_success_path(self) -> None:
        report_id = uuid.uuid4()
        report = make_report(report_id)
        media = make_media()
        verification = make_verification()

        reporting = AsyncMock(spec=ReportingModulePort)
        reporting.get_report.return_value = report
        reporting.get_verifiable_media.return_value = media

        hazard_verifier = AsyncMock(spec=HazardVerifierPort)
        hazard_verifier.verify.return_value = verification

        object_storage = AsyncMock(spec=ObjectStoragePort)
        object_storage.get_object.return_value = b"fake-image-bytes"

        use_case = AutoTriageFieldReportUseCase(
            hazard_verifier=hazard_verifier,
            reporting=reporting,
            object_storage=object_storage,
        )
        result = await use_case.execute(report_id)

        assert result is verification
        object_storage.get_object.assert_awaited_once_with(media.bucket, media.object_key)
        hazard_verifier.verify.assert_awaited_once_with(b"fake-image-bytes")
        reporting.apply_cv_verification.assert_awaited_once_with(
            report_id=report_id,
            hazard_class="LANDSLIDE",
            severity_score=0.8,
            confidence=0.9,
            is_roadway_blocked=True,
        )

    async def test_missing_report_rejected(self) -> None:
        reporting = AsyncMock(spec=ReportingModulePort)
        reporting.get_report.return_value = None
        hazard_verifier = AsyncMock(spec=HazardVerifierPort)
        object_storage = AsyncMock(spec=ObjectStoragePort)

        use_case = AutoTriageFieldReportUseCase(hazard_verifier, reporting, object_storage)
        with pytest.raises(NotFoundError) as excinfo:
            await use_case.execute(uuid.uuid4())

        assert excinfo.value.code == "REPORT_NOT_FOUND"
        hazard_verifier.verify.assert_not_awaited()

    async def test_media_object_missing_in_storage_is_clean_error(self) -> None:
        media = MagicMock(bucket="b", object_key="k")
        reporting = AsyncMock(spec=ReportingModulePort)
        reporting.get_report.return_value = MagicMock()
        reporting.get_verifiable_media.return_value = media
        hazard_verifier = AsyncMock(spec=HazardVerifierPort)
        object_storage = AsyncMock(spec=ObjectStoragePort)
        object_storage.get_object.side_effect = FileNotFoundError("gone")

        use_case = AutoTriageFieldReportUseCase(hazard_verifier, reporting, object_storage)
        with pytest.raises(MediaObjectUnavailableError):
            await use_case.execute(uuid.uuid4())

        hazard_verifier.verify.assert_not_awaited()
        reporting.apply_cv_verification.assert_not_awaited()

    async def test_missing_verifiable_media_rejected(self) -> None:
        report_id = uuid.uuid4()
        reporting = AsyncMock(spec=ReportingModulePort)
        reporting.get_report.return_value = make_report(report_id)
        reporting.get_verifiable_media.return_value = None
        hazard_verifier = AsyncMock(spec=HazardVerifierPort)
        object_storage = AsyncMock(spec=ObjectStoragePort)

        use_case = AutoTriageFieldReportUseCase(hazard_verifier, reporting, object_storage)
        with pytest.raises(MediaObjectUnavailableError):
            await use_case.execute(report_id)

        hazard_verifier.verify.assert_not_awaited()
        object_storage.get_object.assert_not_awaited()
