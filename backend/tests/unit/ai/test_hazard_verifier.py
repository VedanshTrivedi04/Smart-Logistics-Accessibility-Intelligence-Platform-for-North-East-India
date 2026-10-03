"""
tests/unit/ai/test_hazard_verifier.py — OnnxHazardVerifier behaviour with a fake ONNX session.

Covers the honesty rules added with the real single-class landslide model: letterbox
preprocessing, a real "nothing found" confidence, road-blocked only for confident detections, and
coverage disclosure (`detectable_classes`) so a landslide-only model is never read as asserting
"road clear".
"""

from __future__ import annotations

import io
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import numpy as np
import pytest
from PIL import Image

from app.modules.ai.application.auto_triage_report import AutoTriageFieldReportUseCase
from app.modules.ai.application.ports import HazardVerifierPort
from app.modules.ai.domain.entities import HazardVerification
from app.modules.ai.domain.enums import HazardClass, ModelStatus
from app.modules.ai.infrastructure.onnx_hazard_verifier import (
    BLOCKED_MIN_CONFIDENCE,
    CONFIDENCE_THRESHOLD,
    LETTERBOX_FILL,
    OnnxHazardVerifier,
    letterbox,
    max_class_score,
)
from app.modules.reporting.public import ReportingModulePort


def _jpeg(width: int = 200, height: int = 100) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (10, 200, 10)).save(buf, format="JPEG")
    return buf.getvalue()


def _raw(score: float | None) -> np.ndarray:
    """(1, 4+1, 3) YOLO-style tensor; `score` on one box (None -> all zeros)."""
    raw = np.zeros((1, 5, 3), dtype=np.float32)
    if score is not None:
        raw[0, 0:4, 1] = [320.0, 320.0, 100.0, 100.0]
        raw[0, 4, 1] = score
    return raw


def _verifier(raw: np.ndarray, names: dict[int, str] | None = None) -> OnnxHazardVerifier:
    v = OnnxHazardVerifier.__new__(OnnxHazardVerifier)  # skip loading a real model
    v.session = MagicMock()
    v.session.run.return_value = [raw]
    v.input_name, v.input_width, v.input_height = "images", 640, 640
    v.class_names = names or {0: "landslide"}
    v.detectable_classes = tuple(
        sorted(n.upper() for n in v.class_names.values() if n.upper() in HazardClass.__members__)
    )
    return v


class TestLetterbox:
    def test_output_shape_and_range(self) -> None:
        out = letterbox(Image.new("RGB", (200, 100), (255, 255, 255)), 640, 640)
        assert out.shape == (1, 3, 640, 640) and out.dtype == np.float32
        assert 0.0 <= out.min() and out.max() <= 1.0

    def test_preserves_aspect_ratio_with_grey_padding(self) -> None:
        out = letterbox(Image.new("RGB", (200, 100), (255, 255, 255)), 640, 640)
        fill = LETTERBOX_FILL / 255.0
        assert out[0, 0, 0, 320] == pytest.approx(fill)  # top padding row
        assert out[0, 0, 639, 320] == pytest.approx(fill)  # bottom padding row
        assert out[0, 0, 320, 320] == pytest.approx(1.0)  # image centre is the white image
        assert out[0, 0, 320, 0] == pytest.approx(1.0)  # image spans the full width

    def test_square_image_has_no_padding(self) -> None:
        out = letterbox(Image.new("RGB", (64, 64), (255, 255, 255)), 640, 640)
        assert out.min() == pytest.approx(1.0)


class TestMaxClassScore:
    def test_returns_highest_score(self) -> None:
        assert max_class_score(_raw(0.42)) == pytest.approx(0.42)

    def test_empty_tensor_is_zero(self) -> None:
        assert max_class_score(np.zeros((1, 5, 0), dtype=np.float32)) == 0.0


class TestVerify:
    async def test_nothing_found_reports_real_confidence_not_a_constant(self) -> None:
        result = await _verifier(_raw(0.06)).verify(_jpeg())  # below threshold
        assert not result.hazard_detected and result.hazard_class is HazardClass.CLEAR_ROAD
        assert result.confidence == pytest.approx(1.0 - 0.06)
        assert (await _verifier(_raw(None)).verify(_jpeg())).confidence == pytest.approx(1.0)

    async def test_low_confidence_detection_is_flagged_but_not_roadway_blocked(self) -> None:
        score = (CONFIDENCE_THRESHOLD + BLOCKED_MIN_CONFIDENCE) / 2
        result = await _verifier(_raw(score)).verify(_jpeg())
        assert result.hazard_detected and result.hazard_class is HazardClass.LANDSLIDE
        assert result.confidence == pytest.approx(score)
        assert not result.is_roadway_blocked

    async def test_confident_detection_marks_roadway_blocked(self) -> None:
        result = await _verifier(_raw(BLOCKED_MIN_CONFIDENCE + 0.1)).verify(_jpeg())
        assert result.hazard_detected and result.is_roadway_blocked

    async def test_reports_model_coverage(self) -> None:
        result = await _verifier(_raw(0.3)).verify(_jpeg())
        assert result.detectable_classes == ("LANDSLIDE",)
        assert result.model_status is ModelStatus.LOADED

    async def test_full_taxonomy_model_lists_clear_road(self) -> None:
        names = {0: "landslide", 1: "clear_road"}
        result = await _verifier(np.zeros((1, 6, 3), dtype=np.float32), names).verify(_jpeg())
        assert HazardClass.CLEAR_ROAD.value in result.detectable_classes

    async def test_garbage_bytes_rejected(self) -> None:
        from app.modules.ai.domain.exceptions import InvalidFeatureVectorError

        with pytest.raises(InvalidFeatureVectorError):
            await _verifier(_raw(0.3)).verify(b"not an image")


def _triage(verification: HazardVerification) -> tuple[AutoTriageFieldReportUseCase, Any]:
    reporting = AsyncMock(spec=ReportingModulePort)
    reporting.get_report.return_value = MagicMock()
    reporting.get_verifiable_media.return_value = MagicMock(bucket="b", object_key="k")
    storage = AsyncMock()
    storage.get_object.return_value = b"img"
    verifier = AsyncMock(spec=HazardVerifierPort)
    verifier.verify.return_value = verification
    return AutoTriageFieldReportUseCase(verifier, reporting, storage), reporting


def _verification(**kw: Any) -> HazardVerification:
    base: dict[str, Any] = {
        "hazard_detected": False,
        "hazard_class": HazardClass.CLEAR_ROAD,
        "severity_score": 0.0,
        "is_roadway_blocked": False,
        "confidence": 0.9,
        "model_status": ModelStatus.LOADED,
    }
    return HazardVerification(**{**base, **kw})


class TestAutoTriageCoverage:
    async def test_landslide_only_model_finding_nothing_is_not_recorded_as_clear_road(self) -> None:
        uc, reporting = _triage(_verification(detectable_classes=("LANDSLIDE",)))
        result = await uc.execute(uuid.uuid4())
        assert not result.hazard_detected
        reporting.apply_cv_verification.assert_not_awaited()

    async def test_detection_is_recorded_even_by_a_partial_model(self) -> None:
        uc, reporting = _triage(
            _verification(
                hazard_detected=True,
                hazard_class=HazardClass.LANDSLIDE,
                severity_score=0.3,
                confidence=0.3,
                detectable_classes=("LANDSLIDE",),
            )
        )
        await uc.execute(uuid.uuid4())
        reporting.apply_cv_verification.assert_awaited_once()

    async def test_full_taxonomy_model_clear_road_is_recorded(self) -> None:
        uc, reporting = _triage(_verification(detectable_classes=("LANDSLIDE", "CLEAR_ROAD")))
        await uc.execute(uuid.uuid4())
        reporting.apply_cv_verification.assert_awaited_once()

    async def test_unknown_coverage_keeps_previous_behaviour(self) -> None:
        uc, reporting = _triage(_verification())  # detectable_classes == ()
        await uc.execute(uuid.uuid4())
        reporting.apply_cv_verification.assert_awaited_once()
