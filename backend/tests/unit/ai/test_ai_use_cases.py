"""
tests/unit/ai/test_ai_use_cases.py — Unit Tests for AI/ML Application Use Cases (stub adapters).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.modules.ai.application.estimate_eta import EstimateETAUseCase
from app.modules.ai.application.ports import FeatureStoreRepositoryPort
from app.modules.ai.application.predict_edge_risk import PredictEdgeRiskUseCase
from app.modules.ai.application.verify_hazard_photo import VerifyHazardPhotoUseCase
from app.modules.ai.domain.entities import TerrainFeatures, WeatherFeatures
from app.modules.ai.domain.enums import ModelStatus, RiskHorizon, SusceptibilityZone
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError
from app.modules.ai.domain.feature_math import RISK_FEATURE_COLUMNS
from app.modules.ai.infrastructure.catboost_eta_predictor import StubCatboostEtaPredictor
from app.modules.ai.infrastructure.onnx_hazard_verifier import StubOnnxHazardVerifier
from app.modules.ai.infrastructure.xgboost_risk_predictor import StubXgboostRiskPredictor
from app.modules.network.domain.entities import RoadEdge
from app.modules.network.domain.enums import RoadClass, SurfaceType
from app.modules.network.public import NetworkRepositoryPort
from app.modules.routing.public import VehicleConstraints


def make_vehicle() -> VehicleConstraints:
    return VehicleConstraints(
        vehicle_id=None,
        max_weight_kg=16000.0,
        height_m=3.5,
        is_hazmat=False,
        cargo_priority="TIER_2_ESSENTIAL",
        departure_time=datetime.now(UTC),
    )


def make_terrain_features(edge_id: uuid.UUID) -> TerrainFeatures:
    return TerrainFeatures(
        edge_id=edge_id,
        elevation_min_m=100.0,
        elevation_max_m=200.0,
        elevation_mean_m=150.0,
        slope_pct=12.5,
        aspect_deg=90.0,
        curvature_index=1.2,
        susceptibility_zone=SusceptibilityZone.MEDIUM,
        distance_to_stream_m=300.0,
        computed_at=datetime.now(UTC),
    )


def make_weather_features(edge_id: uuid.UUID) -> WeatherFeatures:
    return WeatherFeatures(
        edge_id=edge_id,
        observed_at=datetime.now(UTC),
        rainfall_24h_mm=10.0,
        rainfall_48h_mm=20.0,
        rainfall_72h_mm=30.0,
        ari_score=15.5,
        forecast_rainfall_3h_mm=6.0,
        forecast_rainfall_6h_mm=8.0,
        forecast_rainfall_12h_mm=12.0,
        soil_moisture_index=0.6,
    )


def make_road_edge(edge_id: uuid.UUID) -> RoadEdge:
    return RoadEdge(
        id=edge_id,
        network_version_id=uuid.uuid4(),
        edge_index=1,
        source_node_id=uuid.uuid4(),
        target_node_id=uuid.uuid4(),
        source_index=1,
        target_index=2,
        coordinates=[(91.7, 26.1), (91.8, 26.2)],
        length_meters=5000.0,
        road_class=RoadClass.NATIONAL_HIGHWAY,
        surface_type=SurfaceType.PAVED_ASPHALT,
        speed_limit_kmh=40,
        base_seconds=450.0,
        reverse_base_seconds=450.0,
        elevation_gain_m=200.0,
    )


class TestPredictEdgeRiskUseCase:
    async def test_uses_explicitly_supplied_features(self) -> None:
        use_case = PredictEdgeRiskUseCase(risk_predictor=StubXgboostRiskPredictor())
        edge_id = uuid.uuid4()
        result = await use_case.execute(
            edge_id=edge_id, horizon=RiskHorizon.H12, features={"slope_pct": 10.0}
        )
        assert result.edge_id == edge_id
        assert result.horizon is RiskHorizon.H12
        assert 0.0 <= result.probability <= 1.0
        assert result.model_status is ModelStatus.STUB

    async def test_auto_fetches_features_from_feature_store(self) -> None:
        edge_id = uuid.uuid4()
        feature_store = AsyncMock(spec=FeatureStoreRepositoryPort)
        feature_store.get_terrain_features.return_value = make_terrain_features(edge_id)
        feature_store.get_latest_weather_features.return_value = make_weather_features(edge_id)

        use_case = PredictEdgeRiskUseCase(
            risk_predictor=StubXgboostRiskPredictor(), feature_store=feature_store
        )
        result = await use_case.execute(edge_id=edge_id, horizon=RiskHorizon.H6)

        assert result.edge_id == edge_id
        feature_store.get_terrain_features.assert_awaited_once_with(edge_id)
        feature_store.get_latest_weather_features.assert_awaited_once_with(edge_id)

    async def test_no_features_and_no_feature_store_rejected(self) -> None:
        use_case = PredictEdgeRiskUseCase(risk_predictor=StubXgboostRiskPredictor())
        with pytest.raises(InvalidFeatureVectorError):
            await use_case.execute(edge_id=uuid.uuid4(), horizon=RiskHorizon.H6)

    async def test_missing_feature_store_data_rejected(self) -> None:
        feature_store = AsyncMock(spec=FeatureStoreRepositoryPort)
        feature_store.get_terrain_features.return_value = None
        feature_store.get_latest_weather_features.return_value = None

        use_case = PredictEdgeRiskUseCase(
            risk_predictor=StubXgboostRiskPredictor(), feature_store=feature_store
        )
        with pytest.raises(InvalidFeatureVectorError):
            await use_case.execute(edge_id=uuid.uuid4(), horizon=RiskHorizon.H6)


class TestVerifyHazardPhotoUseCase:
    async def test_returns_stub_verification(self) -> None:
        use_case = VerifyHazardPhotoUseCase(hazard_verifier=StubOnnxHazardVerifier())
        result = await use_case.execute(image_bytes=b"\xff\xd8\xff\xe0fake-jpeg-bytes")
        assert result.model_status is ModelStatus.STUB

    async def test_empty_image_bytes_rejected(self) -> None:
        use_case = VerifyHazardPhotoUseCase(hazard_verifier=StubOnnxHazardVerifier())
        with pytest.raises(InvalidFeatureVectorError):
            await use_case.execute(image_bytes=b"")


class TestEstimateETAUseCase:
    async def test_returns_stub_estimate_scaled_by_edge_count(self) -> None:
        edge_ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
        async def _get_edge_by_id(eid: uuid.UUID) -> RoadEdge:
            return make_road_edge(eid)

        network_repo = AsyncMock(spec=NetworkRepositoryPort)
        network_repo.get_edge_by_id.side_effect = _get_edge_by_id

        use_case = EstimateETAUseCase(
            eta_predictor=StubCatboostEtaPredictor(), network_repo=network_repo
        )
        result = await use_case.execute(edge_ids=edge_ids, vehicle=make_vehicle())

        assert result.model_status is ModelStatus.STUB
        assert result.total_seconds == pytest.approx(180.0)
        assert result.lower_bound_seconds < result.total_seconds < result.upper_bound_seconds
        assert network_repo.get_edge_by_id.await_count == 3

    async def test_empty_edge_ids_rejected(self) -> None:
        network_repo = AsyncMock(spec=NetworkRepositoryPort)
        use_case = EstimateETAUseCase(
            eta_predictor=StubCatboostEtaPredictor(), network_repo=network_repo
        )
        with pytest.raises(InvalidFeatureVectorError):
            await use_case.execute(edge_ids=[], vehicle=make_vehicle())

    async def test_unknown_edge_rejected(self) -> None:
        network_repo = AsyncMock(spec=NetworkRepositoryPort)
        network_repo.get_edge_by_id.return_value = None
        use_case = EstimateETAUseCase(
            eta_predictor=StubCatboostEtaPredictor(), network_repo=network_repo
        )
        with pytest.raises(InvalidFeatureVectorError):
            await use_case.execute(edge_ids=[uuid.uuid4()], vehicle=make_vehicle())

    async def test_enriches_with_feature_store_when_available(self) -> None:
        edge_id = uuid.uuid4()
        network_repo = AsyncMock(spec=NetworkRepositoryPort)
        network_repo.get_edge_by_id.return_value = make_road_edge(edge_id)
        feature_store = AsyncMock(spec=FeatureStoreRepositoryPort)
        feature_store.get_terrain_features.return_value = make_terrain_features(edge_id)
        feature_store.get_latest_weather_features.return_value = make_weather_features(edge_id)

        use_case = EstimateETAUseCase(
            eta_predictor=StubCatboostEtaPredictor(),
            network_repo=network_repo,
            feature_store=feature_store,
        )
        result = await use_case.execute(edge_ids=[edge_id], vehicle=make_vehicle())

        assert result.model_status is ModelStatus.STUB
        feature_store.get_terrain_features.assert_awaited_once_with(edge_id)
        feature_store.get_latest_weather_features.assert_awaited_once_with(edge_id)


def test_risk_feature_columns_are_stable() -> None:
    """
    Guards against an accidental reordering/renaming of RISK_FEATURE_COLUMNS,
    which would silently desync the deployed model from the feature builder.
    """
    assert RISK_FEATURE_COLUMNS == [
        "slope_pct",
        "elevation_mean_m",
        "curvature_index",
        "distance_to_stream_m",
        "susceptibility_zone_score",
        "rainfall_72h_mm",
        "ari_score",
        "soil_moisture_index",
    ]
