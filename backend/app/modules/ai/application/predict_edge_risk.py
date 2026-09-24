"""
app/modules/ai/application/predict_edge_risk.py — Use case for edge disruption-risk prediction.
"""

from __future__ import annotations

from uuid import UUID

from app.modules.ai.application.ports import FeatureStoreRepositoryPort, RiskPredictorPort
from app.modules.ai.domain.entities import RiskAssessment
from app.modules.ai.domain.enums import RiskHorizon
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError
from app.modules.ai.domain.feature_math import build_risk_feature_vector


class PredictEdgeRiskUseCase:
    """
    Predicts disruption risk for a road edge over a forecast horizon.

    If `features` is not explicitly supplied to `execute()`, the use case
    fetches the latest terrain/weather features from `feature_store` and
    builds the vector itself — this is the path the real API endpoint and
    the Phase 4 periodic worker use. Explicitly passing `features` remains
    supported for what-if queries and tests that don't need a feature store.
    """

    def __init__(
        self,
        risk_predictor: RiskPredictorPort,
        feature_store: FeatureStoreRepositoryPort | None = None,
    ) -> None:
        self.risk_predictor = risk_predictor
        self.feature_store = feature_store

    async def execute(
        self,
        edge_id: UUID,
        horizon: RiskHorizon,
        features: dict[str, float] | None = None,
    ) -> RiskAssessment:
        if features is None:
            features = await self._build_feature_vector(edge_id)

        return await self.risk_predictor.predict(
            edge_id=edge_id,
            horizon=horizon,
            features=features,
        )

    async def _build_feature_vector(self, edge_id: UUID) -> dict[str, float]:
        if self.feature_store is None:
            raise InvalidFeatureVectorError(
                "No features supplied and no feature_store configured to fetch them"
            )

        terrain = await self.feature_store.get_terrain_features(edge_id)
        weather = await self.feature_store.get_latest_weather_features(edge_id)
        if terrain is None or weather is None:
            raise InvalidFeatureVectorError(
                f"No terrain/weather feature-store data available for edge {edge_id}"
            )

        return build_risk_feature_vector(terrain, weather)
