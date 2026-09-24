"""
app/modules/ai/infrastructure/xgboost_risk_predictor.py — Risk predictor adapter.

Two implementations:
  - StubXgboostRiskPredictor: fixed placeholder probability (Phase 0). Used
    as an automatic fallback when no model artifact is present.
  - XgboostRiskPredictor: loads a real XGBoost model (joblib .pkl) plus a
    SHAP TreeExplainer, and returns a calibrated probability with the top-3
    SHAP feature contributions. As of Phase 3, the only artifact available
    was trained on SYNTHETIC data (see ml-training/README.md) — the wiring
    is real, the model's accuracy is not.

get_risk_predictor() is the single entry point api/routes.py should use: it
lazily loads the real model once per process (cached) and falls back to the
stub — logging a warning — if the artifact or its dependencies are missing,
so a missing model file never crashes app startup or a request.
"""

from __future__ import annotations

from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from uuid import UUID

from app.core.logging import get_logger
from app.modules.ai.application.ports import RiskPredictorPort
from app.modules.ai.domain.entities import FeatureContribution, RiskAssessment
from app.modules.ai.domain.enums import ModelStatus, RiskHorizon
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError, ModelNotLoadedError
from app.modules.ai.domain.feature_math import RISK_FEATURE_COLUMNS

logger = get_logger(__name__)

MODEL_PATH = Path(__file__).resolve().parent / "models" / "risk_model_xgboost.pkl"

# Placeholder probability used by the stub adapter.
_STUB_PROBABILITY = 0.1

# Number of top SHAP contributions to surface (aiml developer.md §4 Explainability).
_TOP_N_CONTRIBUTIONS = 3


class StubXgboostRiskPredictor(RiskPredictorPort):
    """Stub adapter for RiskPredictorPort. No model artifact loaded."""

    async def predict(
        self,
        edge_id: UUID,
        horizon: RiskHorizon,
        features: dict[str, float],
    ) -> RiskAssessment:
        return RiskAssessment(
            edge_id=edge_id,
            horizon=horizon,
            probability=_STUB_PROBABILITY,
            model_status=ModelStatus.STUB,
            top_contributions=[],
            predicted_at=datetime.now(UTC),
        )


class XgboostRiskPredictor(RiskPredictorPort):
    """Real adapter for RiskPredictorPort, backed by a trained XGBoost model."""

    def __init__(self, model_path: Path) -> None:
        if not model_path.exists():
            raise ModelNotLoadedError(f"Risk model artifact not found at {model_path}")

        import joblib
        import shap

        self.model = joblib.load(model_path)
        self.explainer = shap.TreeExplainer(self.model)

    async def predict(
        self,
        edge_id: UUID,
        horizon: RiskHorizon,
        features: dict[str, float],
    ) -> RiskAssessment:
        missing = [c for c in RISK_FEATURE_COLUMNS if c not in features]
        if missing:
            raise InvalidFeatureVectorError(f"Missing required risk features: {missing}")

        import pandas as pd

        row = pd.DataFrame([{c: features[c] for c in RISK_FEATURE_COLUMNS}])
        probability = float(self.model.predict_proba(row)[0, 1])

        shap_values = self.explainer.shap_values(row)[0]
        ranked = sorted(
            zip(RISK_FEATURE_COLUMNS, shap_values, strict=True),
            key=lambda pair: abs(pair[1]),
            reverse=True,
        )
        top_contributions = [
            FeatureContribution(
                feature_name=name, value=features[name], shap_contribution=float(value)
            )
            for name, value in ranked[:_TOP_N_CONTRIBUTIONS]
        ]

        return RiskAssessment(
            edge_id=edge_id,
            horizon=horizon,
            probability=probability,
            model_status=ModelStatus.LOADED,
            top_contributions=top_contributions,
            predicted_at=datetime.now(UTC),
        )


@lru_cache(maxsize=1)
def get_risk_predictor() -> RiskPredictorPort:
    """Load the real risk predictor once per process, falling back to the stub."""
    try:
        return XgboostRiskPredictor(MODEL_PATH)
    except ModelNotLoadedError:
        logger.warning("risk_model_not_found_using_stub", model_path=str(MODEL_PATH))
    except ImportError as exc:
        logger.warning("risk_model_deps_missing_using_stub", error=str(exc))
    return StubXgboostRiskPredictor()
