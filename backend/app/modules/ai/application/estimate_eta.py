"""
app/modules/ai/application/estimate_eta.py — Use case for terrain-aware ETA estimation.
"""

from __future__ import annotations

from uuid import UUID

from app.modules.ai.application.ports import ETAPredictorPort, FeatureStoreRepositoryPort
from app.modules.ai.domain.entities import ETAEstimate
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError
from app.modules.ai.domain.feature_math import build_eta_feature_vector
from app.modules.network.public import NetworkRepositoryPort
from app.modules.routing.public import VehicleConstraints


class EstimateETAUseCase:
    """
    Estimates calibrated, terrain/weather-adjusted travel time for a route.

    Resolves each edge_id's geometry via `network_repo` (length, elevation
    gain) and enriches it with `feature_store` data (curvature/tortuosity,
    forecast rainfall) when available, defaulting to neutral values
    (tortuosity=1.0, rainfall=0.0) when the feature store has no data yet
    for an edge — geometry is required, weather/terrain enrichment is not.
    """

    def __init__(
        self,
        eta_predictor: ETAPredictorPort,
        network_repo: NetworkRepositoryPort,
        feature_store: FeatureStoreRepositoryPort | None = None,
    ) -> None:
        self.eta_predictor = eta_predictor
        self.network_repo = network_repo
        self.feature_store = feature_store

    async def execute(
        self,
        edge_ids: list[UUID],
        vehicle: VehicleConstraints,
    ) -> ETAEstimate:
        if not edge_ids:
            raise InvalidFeatureVectorError("edge_ids must not be empty")

        edge_features = [
            await self._build_edge_feature_vector(edge_id, vehicle) for edge_id in edge_ids
        ]
        return await self.eta_predictor.estimate(edge_features)

    async def _build_edge_feature_vector(
        self,
        edge_id: UUID,
        vehicle: VehicleConstraints,
    ) -> dict[str, float]:
        edge = await self.network_repo.get_edge_by_id(edge_id)
        if edge is None:
            raise InvalidFeatureVectorError(f"Edge {edge_id} not found")

        tortuosity_index = 1.0
        rainfall_rate_mmhr = 0.0
        if self.feature_store is not None:
            terrain = await self.feature_store.get_terrain_features(edge_id)
            if terrain is not None:
                tortuosity_index = terrain.curvature_index

            weather = await self.feature_store.get_latest_weather_features(edge_id)
            if weather is not None:
                rainfall_rate_mmhr = weather.forecast_rainfall_3h_mm / 3.0

        return build_eta_feature_vector(
            length_km=edge.length_meters / 1000.0,
            elevation_gain_m=edge.elevation_gain_m,
            tortuosity_index=tortuosity_index,
            rainfall_rate_mmhr=rainfall_rate_mmhr,
            vehicle_weight_kg=vehicle.max_weight_kg,
        )
