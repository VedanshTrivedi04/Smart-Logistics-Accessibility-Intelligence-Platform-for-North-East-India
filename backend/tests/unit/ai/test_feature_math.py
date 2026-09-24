"""
tests/unit/ai/test_feature_math.py — Unit Tests for AI/ML Pure Feature-Engineering Math.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from app.modules.ai.domain.enums import SusceptibilityZone
from app.modules.ai.domain.feature_math import (
    build_terrain_features,
    classify_susceptibility_zone_by_slope,
    compute_antecedent_rainfall_index,
    compute_aspect_degrees,
    compute_slope_degrees,
    compute_slope_percent,
    compute_tortuosity_index,
    haversine_meters,
)


class TestAntecedentRainfallIndex:
    def test_no_rainfall_gives_zero(self) -> None:
        assert compute_antecedent_rainfall_index([]) == 0.0
        assert compute_antecedent_rainfall_index([0.0, 0.0, 0.0]) == 0.0

    def test_known_formula_value(self) -> None:
        # ARI = 0.85^1 * 10 + 0.85^2 * 20 = 8.5 + 14.45 = 22.95
        result = compute_antecedent_rainfall_index([10.0, 20.0])
        assert result == pytest.approx(22.95)

    def test_window_capped_at_seven_days(self) -> None:
        # 10 days of 100mm each; only the most recent 7 should be summed.
        eight_days = [100.0] * 10
        with_extra_days = compute_antecedent_rainfall_index(eight_days)
        seven_days_only = compute_antecedent_rainfall_index(eight_days[:7])
        assert with_extra_days == pytest.approx(seven_days_only)

    def test_negative_rainfall_rejected(self) -> None:
        with pytest.raises(ValueError):
            compute_antecedent_rainfall_index([-1.0])

    @pytest.mark.parametrize("bad_decay", [0.0, 1.0, -0.5, 1.5])
    def test_decay_out_of_range_rejected(self, bad_decay: float) -> None:
        with pytest.raises(ValueError):
            compute_antecedent_rainfall_index([10.0], decay=bad_decay)


class TestSlopeMath:
    def test_slope_percent_basic(self) -> None:
        assert compute_slope_percent(rise_m=50.0, run_m=1000.0) == pytest.approx(5.0)

    def test_slope_percent_zero_run_positive_rise(self) -> None:
        assert compute_slope_percent(rise_m=10.0, run_m=0.0) == 100.0

    def test_slope_percent_zero_run_zero_rise(self) -> None:
        assert compute_slope_percent(rise_m=0.0, run_m=0.0) == 0.0

    def test_slope_degrees_45(self) -> None:
        assert compute_slope_degrees(rise_m=100.0, run_m=100.0) == pytest.approx(45.0)


class TestAspect:
    def test_due_north(self) -> None:
        assert compute_aspect_degrees(dx=0.0, dy=1.0) == pytest.approx(0.0)

    def test_due_east(self) -> None:
        assert compute_aspect_degrees(dx=1.0, dy=0.0) == pytest.approx(90.0)

    def test_wraps_into_0_360_range(self) -> None:
        result = compute_aspect_degrees(dx=-0.001, dy=-1.0)
        assert 0.0 <= result < 360.0


class TestHaversineAndTortuosity:
    def test_haversine_zero_for_identical_points(self) -> None:
        assert haversine_meters(91.7, 26.1, 91.7, 26.1) == pytest.approx(0.0)

    def test_tortuosity_straight_line_is_one(self) -> None:
        coords = [(91.70, 26.10), (91.71, 26.10)]
        straight_dist = haversine_meters(*coords[0], *coords[1])
        index = compute_tortuosity_index(coords, length_meters=straight_dist)
        assert index == pytest.approx(1.0, rel=1e-3)

    def test_tortuosity_curved_path_greater_than_one(self) -> None:
        coords = [(91.70, 26.10), (91.71, 26.10)]
        straight_dist = haversine_meters(*coords[0], *coords[1])
        index = compute_tortuosity_index(coords, length_meters=straight_dist * 2)
        assert index == pytest.approx(2.0, rel=1e-3)

    def test_tortuosity_requires_two_points(self) -> None:
        with pytest.raises(ValueError):
            compute_tortuosity_index([(91.7, 26.1)], length_meters=100.0)

    def test_tortuosity_requires_positive_length(self) -> None:
        with pytest.raises(ValueError):
            compute_tortuosity_index([(91.7, 26.1), (91.8, 26.2)], length_meters=0.0)


class TestSusceptibilityClassification:
    @pytest.mark.parametrize(
        "slope_pct,expected",
        [
            (5.0, SusceptibilityZone.LOW),
            (14.9, SusceptibilityZone.LOW),
            (15.0, SusceptibilityZone.MEDIUM),
            (24.9, SusceptibilityZone.MEDIUM),
            (25.0, SusceptibilityZone.HIGH),
            (34.9, SusceptibilityZone.HIGH),
            (35.0, SusceptibilityZone.VERY_HIGH),
            (60.0, SusceptibilityZone.VERY_HIGH),
        ],
    )
    def test_thresholds(self, slope_pct: float, expected: SusceptibilityZone) -> None:
        assert classify_susceptibility_zone_by_slope(slope_pct) is expected


class TestBuildTerrainFeatures:
    def test_builds_consistent_features_from_elevation_profile(self) -> None:
        edge_id = uuid.uuid4()
        coords = [(91.70, 26.10), (91.71, 26.11)]
        length_m = haversine_meters(*coords[0], *coords[1])
        elevations = [100.0, 120.0, 150.0]

        result = build_terrain_features(
            edge_id=edge_id,
            coordinates=coords,
            length_meters=length_m,
            elevations_m=elevations,
            distance_to_stream_m=250.0,
            computed_at=datetime.now(UTC),
        )

        assert result.edge_id == edge_id
        assert result.elevation_min_m == 100.0
        assert result.elevation_max_m == 150.0
        assert result.elevation_mean_m == pytest.approx(123.333, rel=1e-3)
        assert result.slope_pct == pytest.approx(compute_slope_percent(50.0, length_m))
        assert result.susceptibility_zone in SusceptibilityZone
        assert result.distance_to_stream_m == 250.0

    def test_empty_elevations_rejected(self) -> None:
        with pytest.raises(ValueError):
            build_terrain_features(
                edge_id=uuid.uuid4(),
                coordinates=[(91.7, 26.1), (91.8, 26.2)],
                length_meters=1000.0,
                elevations_m=[],
                distance_to_stream_m=100.0,
                computed_at=datetime.now(UTC),
            )
