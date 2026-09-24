"""
tests/unit/ai/test_ai_domain.py — Unit Tests for AI/ML Domain Entities.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from app.modules.ai.domain.entities import (
    ETAEstimate,
    HazardVerification,
    LandslideEvent,
    RiskAssessment,
    TerrainFeatures,
    WeatherFeatures,
)
from app.modules.ai.domain.enums import HazardClass, ModelStatus, RiskHorizon, SusceptibilityZone


class TestRiskAssessment:
    def test_valid_probability_accepted(self) -> None:
        r = RiskAssessment(
            edge_id=uuid.uuid4(),
            horizon=RiskHorizon.H6,
            probability=0.42,
            model_status=ModelStatus.STUB,
        )
        assert r.probability == 0.42

    @pytest.mark.parametrize("bad_probability", [-0.01, 1.01, 2.0, -5.0])
    def test_out_of_range_probability_rejected(self, bad_probability: float) -> None:
        with pytest.raises(ValueError):
            RiskAssessment(
                edge_id=uuid.uuid4(),
                horizon=RiskHorizon.H6,
                probability=bad_probability,
                model_status=ModelStatus.STUB,
            )


class TestHazardVerification:
    def test_valid_scores_accepted(self) -> None:
        h = HazardVerification(
            hazard_detected=True,
            hazard_class=HazardClass.LANDSLIDE,
            severity_score=0.8,
            is_roadway_blocked=True,
            confidence=0.95,
            model_status=ModelStatus.STUB,
        )
        assert h.hazard_class is HazardClass.LANDSLIDE

    def test_out_of_range_severity_rejected(self) -> None:
        with pytest.raises(ValueError):
            HazardVerification(
                hazard_detected=True,
                hazard_class=HazardClass.LANDSLIDE,
                severity_score=1.5,
                is_roadway_blocked=True,
                confidence=0.5,
                model_status=ModelStatus.STUB,
            )

    def test_out_of_range_confidence_rejected(self) -> None:
        with pytest.raises(ValueError):
            HazardVerification(
                hazard_detected=True,
                hazard_class=HazardClass.LANDSLIDE,
                severity_score=0.5,
                is_roadway_blocked=True,
                confidence=-0.1,
                model_status=ModelStatus.STUB,
            )


class TestETAEstimate:
    def test_valid_bounds_accepted(self) -> None:
        e = ETAEstimate(
            total_seconds=100.0,
            lower_bound_seconds=80.0,
            upper_bound_seconds=120.0,
            model_status=ModelStatus.STUB,
        )
        assert e.total_seconds == 100.0

    def test_negative_total_rejected(self) -> None:
        with pytest.raises(ValueError):
            ETAEstimate(
                total_seconds=-1.0,
                lower_bound_seconds=0.0,
                upper_bound_seconds=10.0,
                model_status=ModelStatus.STUB,
            )

    def test_inverted_bounds_rejected(self) -> None:
        with pytest.raises(ValueError):
            ETAEstimate(
                total_seconds=100.0,
                lower_bound_seconds=150.0,
                upper_bound_seconds=120.0,
                model_status=ModelStatus.STUB,
            )


def make_terrain_features(**overrides: object) -> TerrainFeatures:
    defaults: dict[str, object] = {
        "edge_id": uuid.uuid4(),
        "elevation_min_m": 100.0,
        "elevation_max_m": 200.0,
        "elevation_mean_m": 150.0,
        "slope_pct": 12.5,
        "aspect_deg": 90.0,
        "curvature_index": 1.2,
        "susceptibility_zone": SusceptibilityZone.MEDIUM,
        "distance_to_stream_m": 300.0,
        "computed_at": datetime.now(UTC),
    }
    defaults.update(overrides)
    return TerrainFeatures(**defaults)  # type: ignore[arg-type]


class TestTerrainFeatures:
    def test_valid_values_accepted(self) -> None:
        f = make_terrain_features()
        assert f.susceptibility_zone is SusceptibilityZone.MEDIUM

    def test_inverted_elevation_bounds_rejected(self) -> None:
        with pytest.raises(ValueError):
            make_terrain_features(elevation_min_m=200.0, elevation_max_m=100.0)

    @pytest.mark.parametrize("bad_aspect", [-1.0, 360.0, 400.0])
    def test_out_of_range_aspect_rejected(self, bad_aspect: float) -> None:
        with pytest.raises(ValueError):
            make_terrain_features(aspect_deg=bad_aspect)

    def test_negative_slope_rejected(self) -> None:
        with pytest.raises(ValueError):
            make_terrain_features(slope_pct=-1.0)

    def test_negative_distance_to_stream_rejected(self) -> None:
        with pytest.raises(ValueError):
            make_terrain_features(distance_to_stream_m=-1.0)


def make_weather_features(**overrides: object) -> WeatherFeatures:
    defaults: dict[str, object] = {
        "edge_id": uuid.uuid4(),
        "observed_at": datetime.now(UTC),
        "rainfall_24h_mm": 10.0,
        "rainfall_48h_mm": 20.0,
        "rainfall_72h_mm": 30.0,
        "ari_score": 15.5,
        "forecast_rainfall_3h_mm": 2.0,
        "forecast_rainfall_6h_mm": 4.0,
        "forecast_rainfall_12h_mm": 8.0,
        "soil_moisture_index": 0.6,
    }
    defaults.update(overrides)
    return WeatherFeatures(**defaults)  # type: ignore[arg-type]


class TestWeatherFeatures:
    def test_valid_values_accepted(self) -> None:
        w = make_weather_features()
        assert w.ari_score == 15.5

    def test_negative_rainfall_rejected(self) -> None:
        with pytest.raises(ValueError):
            make_weather_features(rainfall_24h_mm=-1.0)

    @pytest.mark.parametrize("bad_moisture", [-0.1, 1.1])
    def test_out_of_range_soil_moisture_rejected(self, bad_moisture: float) -> None:
        with pytest.raises(ValueError):
            make_weather_features(soil_moisture_index=bad_moisture)


class TestLandslideEvent:
    def test_constructs_with_no_edge_match(self) -> None:
        event = LandslideEvent(
            id=uuid.uuid4(),
            edge_id=None,
            longitude=91.75,
            latitude=26.15,
            occurred_at=datetime.now(UTC),
            source="GSI_BHUSANKET",
            severity="HIGH",
        )
        assert event.edge_id is None
        assert event.source == "GSI_BHUSANKET"
