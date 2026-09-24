"""
app/modules/ai/infrastructure/catboost_eta_predictor.py — ETA predictor adapter.

Two implementations:
  - StubCatboostEtaPredictor: flat per-edge duration estimate (Phase 0).
    Used as an automatic fallback when no model artifact is present.
  - CatboostEtaPredictor: loads a real CatBoost regression model (.cbm) plus
    its training-time residual standard deviation (for a homoscedastic
    confidence band), and predicts per-edge duration, summing across edges.
    As of Phase 3, the only artifact available was trained on SYNTHETIC data
    (see ml-training/README.md) — the wiring is real, the model's accuracy
    is not.

get_eta_predictor() is the single entry point api/routes.py should use.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from app.core.logging import get_logger
from app.modules.ai.application.ports import ETAPredictorPort
from app.modules.ai.domain.entities import ETAEstimate
from app.modules.ai.domain.enums import ModelStatus
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError, ModelNotLoadedError
from app.modules.ai.domain.feature_math import ETA_FEATURE_COLUMNS

logger = get_logger(__name__)

MODEL_PATH = Path(__file__).resolve().parent / "models" / "eta_model_catboost.cbm"
METRICS_PATH = Path(__file__).resolve().parent / "models" / "eta_model_metrics.json"

# Flat placeholder duration per edge, used by the stub adapter.
_STUB_SECONDS_PER_EDGE = 60.0
_STUB_CONFIDENCE_BAND_PCT = 0.2


class StubCatboostEtaPredictor(ETAPredictorPort):
    """Stub adapter for ETAPredictorPort. No model artifact loaded."""

    async def estimate(self, edge_features: list[dict[str, float]]) -> ETAEstimate:
        total = _STUB_SECONDS_PER_EDGE * len(edge_features)
        band = total * _STUB_CONFIDENCE_BAND_PCT
        return ETAEstimate(
            total_seconds=total,
            lower_bound_seconds=max(0.0, total - band),
            upper_bound_seconds=total + band,
            model_status=ModelStatus.STUB,
        )


class CatboostEtaPredictor(ETAPredictorPort):
    """Real adapter for ETAPredictorPort, backed by a trained CatBoost model."""

    def __init__(self, model_path: Path, metrics_path: Path) -> None:
        if not model_path.exists():
            raise ModelNotLoadedError(f"ETA model artifact not found at {model_path}")

        from catboost import CatBoostRegressor

        self.model = CatBoostRegressor()
        self.model.load_model(str(model_path))

        self.residual_std_seconds = 0.0
        if metrics_path.exists():
            metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
            self.residual_std_seconds = float(metrics.get("residual_std_seconds", 0.0))
        else:
            logger.warning(
                "eta_model_metrics_missing_zero_confidence_band", metrics_path=str(metrics_path)
            )

    async def estimate(self, edge_features: list[dict[str, float]]) -> ETAEstimate:
        if not edge_features:
            raise InvalidFeatureVectorError("edge_features must not be empty")

        for i, features in enumerate(edge_features):
            missing = [c for c in ETA_FEATURE_COLUMNS if c not in features]
            if missing:
                raise InvalidFeatureVectorError(
                    f"Missing required ETA features at index {i}: {missing}"
                )

        import pandas as pd

        rows = pd.DataFrame([{c: f[c] for c in ETA_FEATURE_COLUMNS} for f in edge_features])
        predictions = self.model.predict(rows)
        total_seconds = float(sum(predictions))

        # Naive independent-error assumption: combined std scales with sqrt(n).
        # Real Phase-3+ work should replace this with CatBoost virtual-ensemble
        # uncertainty estimation once trained on real data.
        combined_std = self.residual_std_seconds * math.sqrt(len(edge_features))

        return ETAEstimate(
            total_seconds=total_seconds,
            lower_bound_seconds=max(0.0, total_seconds - combined_std),
            upper_bound_seconds=total_seconds + combined_std,
            model_status=ModelStatus.LOADED,
        )


@lru_cache(maxsize=1)
def get_eta_predictor() -> ETAPredictorPort:
    """Load the real ETA predictor once per process, falling back to the stub."""
    try:
        return CatboostEtaPredictor(MODEL_PATH, METRICS_PATH)
    except ModelNotLoadedError:
        logger.warning("eta_model_not_found_using_stub", model_path=str(MODEL_PATH))
    except ImportError as exc:
        logger.warning("eta_model_deps_missing_using_stub", error=str(exc))
    return StubCatboostEtaPredictor()
