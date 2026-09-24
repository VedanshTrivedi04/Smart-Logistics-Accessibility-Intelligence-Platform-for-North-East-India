"""
tests/unit/ai/test_real_adapters.py — Unit Tests for the Phase 3 Real Inference Adapters.

Tests split into two groups:
  1. Pure-logic tests (decode_yolov8_output, factory stub-fallback behavior) —
     always run, no model artifact required.
  2. Real-model tests — skipped automatically if the corresponding gitignored
     artifact under app/modules/ai/infrastructure/models/ isn't present (e.g.
     a fresh clone without ml-training's output copied in yet), but run for
     real in this dev environment since the synthetic-trained artifacts are
     present here.
"""

from __future__ import annotations

import uuid

import numpy as np
import pytest

from app.modules.ai.domain.entities import ETAEstimate, HazardVerification, RiskAssessment
from app.modules.ai.domain.enums import ModelStatus, RiskHorizon
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError, ModelNotLoadedError
from app.modules.ai.infrastructure import catboost_eta_predictor as eta_module
from app.modules.ai.infrastructure import onnx_hazard_verifier as onnx_module
from app.modules.ai.infrastructure import xgboost_risk_predictor as risk_module
from app.modules.ai.infrastructure.catboost_eta_predictor import (
    CatboostEtaPredictor,
    StubCatboostEtaPredictor,
    get_eta_predictor,
)
from app.modules.ai.infrastructure.onnx_hazard_verifier import (
    OnnxHazardVerifier,
    StubOnnxHazardVerifier,
    decode_yolov8_output,
    get_hazard_verifier,
)
from app.modules.ai.infrastructure.xgboost_risk_predictor import (
    StubXgboostRiskPredictor,
    XgboostRiskPredictor,
    get_risk_predictor,
)


class TestDecodeYolov8Output:
    def test_detects_single_high_confidence_box(self) -> None:
        # (1, 4+nc, num_boxes) with nc=2, num_boxes=3; only box 1 clears threshold.
        raw = np.zeros((1, 6, 3), dtype=np.float32)
        raw[0, 0:4, 1] = [50.0, 50.0, 20.0, 20.0]  # cx, cy, w, h
        raw[0, 4, 1] = 0.9  # class 0 score
        raw[0, 5, 1] = 0.1  # class 1 score

        detections = decode_yolov8_output(raw, class_names={0: "LANDSLIDE", 1: "CLEAR_ROAD"})

        assert detections == [("LANDSLIDE", pytest.approx(0.9))]

    def test_no_detections_below_threshold(self) -> None:
        raw = np.full((1, 5, 4), 0.05, dtype=np.float32)
        detections = decode_yolov8_output(raw, class_names={0: "LANDSLIDE"})
        assert detections == []

    def test_nms_suppresses_overlapping_duplicate_boxes(self) -> None:
        raw = np.zeros((1, 5, 2), dtype=np.float32)
        # Two near-identical boxes at the same location — NMS should keep only one.
        raw[0, 0:4, 0] = [50.0, 50.0, 20.0, 20.0]
        raw[0, 4, 0] = 0.9
        raw[0, 0:4, 1] = [51.0, 51.0, 20.0, 20.0]
        raw[0, 4, 1] = 0.8

        detections = decode_yolov8_output(raw, class_names={0: "LANDSLIDE"})

        assert len(detections) == 1
        assert detections[0][1] == pytest.approx(0.9)

    def test_distinct_non_overlapping_boxes_both_kept(self) -> None:
        raw = np.zeros((1, 5, 2), dtype=np.float32)
        raw[0, 0:4, 0] = [10.0, 10.0, 10.0, 10.0]
        raw[0, 4, 0] = 0.9
        raw[0, 0:4, 1] = [100.0, 100.0, 10.0, 10.0]
        raw[0, 4, 1] = 0.8

        detections = decode_yolov8_output(raw, class_names={0: "LANDSLIDE"})

        assert len(detections) == 2


class TestFactoryStubFallback:
    def test_get_risk_predictor_falls_back_to_stub_when_model_missing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        get_risk_predictor.cache_clear()
        missing_path = risk_module.MODEL_PATH.parent / "does_not_exist.pkl"
        monkeypatch.setattr(risk_module, "MODEL_PATH", missing_path)
        predictor = get_risk_predictor()
        assert isinstance(predictor, StubXgboostRiskPredictor)
        get_risk_predictor.cache_clear()

    def test_get_eta_predictor_falls_back_to_stub_when_model_missing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        get_eta_predictor.cache_clear()
        missing_path = eta_module.MODEL_PATH.parent / "does_not_exist.cbm"
        monkeypatch.setattr(eta_module, "MODEL_PATH", missing_path)
        predictor = get_eta_predictor()
        assert isinstance(predictor, StubCatboostEtaPredictor)
        get_eta_predictor.cache_clear()

    def test_get_hazard_verifier_falls_back_to_stub_when_model_missing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        get_hazard_verifier.cache_clear()
        missing_path = onnx_module.MODEL_PATH.parent / "does_not_exist.onnx"
        monkeypatch.setattr(onnx_module, "MODEL_PATH", missing_path)
        verifier = get_hazard_verifier()
        assert isinstance(verifier, StubOnnxHazardVerifier)
        get_hazard_verifier.cache_clear()


@pytest.mark.skipif(
    not risk_module.MODEL_PATH.exists(),
    reason="risk_model_xgboost.pkl not present (gitignored, copy from ml-training/models/)",
)
class TestXgboostRiskPredictorReal:
    async def test_predicts_valid_probability_with_shap_contributions(self) -> None:
        predictor = XgboostRiskPredictor(risk_module.MODEL_PATH)
        features = {
            "slope_pct": 30.0,
            "elevation_mean_m": 900.0,
            "curvature_index": 1.5,
            "distance_to_stream_m": 100.0,
            "susceptibility_zone_score": 0.8,
            "rainfall_72h_mm": 200.0,
            "ari_score": 90.0,
            "soil_moisture_index": 0.7,
        }
        result = await predictor.predict(uuid.uuid4(), horizon=RiskHorizon.H24, features=features)

        assert isinstance(result, RiskAssessment)
        assert 0.0 <= result.probability <= 1.0
        assert result.model_status is ModelStatus.LOADED
        assert 1 <= len(result.top_contributions) <= 3

    async def test_missing_features_rejected(self) -> None:
        predictor = XgboostRiskPredictor(risk_module.MODEL_PATH)
        with pytest.raises(InvalidFeatureVectorError):
            await predictor.predict(
                uuid.uuid4(), horizon=RiskHorizon.H24, features={"slope_pct": 1.0}
            )

    def test_missing_artifact_raises_model_not_loaded(self, tmp_path: object) -> None:
        from pathlib import Path

        with pytest.raises(ModelNotLoadedError):
            XgboostRiskPredictor(Path(str(tmp_path)) / "missing.pkl")


@pytest.mark.skipif(
    not eta_module.MODEL_PATH.exists(),
    reason="eta_model_catboost.cbm not present (gitignored, copy from ml-training/models/)",
)
class TestCatboostEtaPredictorReal:
    async def test_predicts_positive_duration_with_bounds(self) -> None:
        predictor = CatboostEtaPredictor(eta_module.MODEL_PATH, eta_module.METRICS_PATH)
        edge_features = [
            {
                "length_km": 5.0,
                "elevation_gain_m": 200.0,
                "tortuosity_index": 1.3,
                "rainfall_rate_mmhr": 10.0,
                "vehicle_weight_kg": 16000.0,
            },
            {
                "length_km": 3.0,
                "elevation_gain_m": 50.0,
                "tortuosity_index": 1.1,
                "rainfall_rate_mmhr": 2.0,
                "vehicle_weight_kg": 16000.0,
            },
        ]
        result = await predictor.estimate(edge_features)

        assert isinstance(result, ETAEstimate)
        assert result.total_seconds > 0.0
        assert result.lower_bound_seconds <= result.total_seconds <= result.upper_bound_seconds
        assert result.model_status is ModelStatus.LOADED

    async def test_empty_features_rejected(self) -> None:
        predictor = CatboostEtaPredictor(eta_module.MODEL_PATH, eta_module.METRICS_PATH)
        with pytest.raises(InvalidFeatureVectorError):
            await predictor.estimate([])


@pytest.mark.skipif(
    not onnx_module.MODEL_PATH.exists(),
    reason="hazard_model.onnx not present (gitignored artifact, copy from ml-training/models/)",
)
class TestOnnxHazardVerifierReal:
    async def test_verify_returns_valid_result_for_a_real_image(self) -> None:
        from io import BytesIO

        from PIL import Image

        verifier = OnnxHazardVerifier(onnx_module.MODEL_PATH)
        img = Image.new("RGB", (128, 128), color=(90, 90, 90))
        buf = BytesIO()
        img.save(buf, format="JPEG")

        result = await verifier.verify(buf.getvalue())

        assert isinstance(result, HazardVerification)
        assert result.model_status is ModelStatus.LOADED
        assert 0.0 <= result.confidence <= 1.0
        assert 0.0 <= result.severity_score <= 1.0

    async def test_empty_bytes_rejected(self) -> None:
        verifier = OnnxHazardVerifier(onnx_module.MODEL_PATH)
        with pytest.raises(InvalidFeatureVectorError):
            await verifier.verify(b"")
