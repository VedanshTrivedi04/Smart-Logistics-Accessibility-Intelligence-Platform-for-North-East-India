"""
tests/unit/ai/test_dispatch_math.py — Unit Tests for Pure Dispatch-Optimization Math.
"""

from __future__ import annotations

import pytest

from app.modules.ai.domain.dispatch_math import (
    apply_risk_penalty,
    build_haversine_distance_matrix,
    estimate_duration_seconds,
)
from app.modules.ai.domain.feature_math import haversine_meters


class TestBuildHaversineDistanceMatrix:
    def test_diagonal_is_zero(self) -> None:
        points = [(91.7, 26.1), (91.8, 26.2), (92.0, 26.3)]
        matrix = build_haversine_distance_matrix(points)
        for i in range(len(points)):
            assert matrix[i][i] == 0.0

    def test_matches_haversine_directly(self) -> None:
        points = [(91.7, 26.1), (91.8, 26.2)]
        matrix = build_haversine_distance_matrix(points)
        expected = haversine_meters(91.7, 26.1, 91.8, 26.2)
        assert matrix[0][1] == pytest.approx(expected)
        assert matrix[1][0] == pytest.approx(expected)

    def test_single_point_matrix(self) -> None:
        matrix = build_haversine_distance_matrix([(91.7, 26.1)])
        assert matrix == [[0.0]]


class TestApplyRiskPenalty:
    def test_zero_risk_leaves_distances_unchanged_off_diagonal(self) -> None:
        distances = [[0.0, 100.0], [100.0, 0.0]]
        result = apply_risk_penalty(distances, [0.0, 0.0])
        assert result[0][1] == pytest.approx(100.0)
        assert result[1][0] == pytest.approx(100.0)

    def test_full_risk_doubles_arc_cost_at_weight_one(self) -> None:
        distances = [[0.0, 100.0], [100.0, 0.0]]
        result = apply_risk_penalty(distances, [0.0, 1.0], weight=1.0)
        assert result[0][1] == pytest.approx(200.0)  # arriving at node 1 (risk=1.0)
        assert result[1][0] == pytest.approx(100.0)  # arriving at node 0 (risk=0.0)

    def test_diagonal_stays_zero(self) -> None:
        distances = [[0.0, 100.0], [100.0, 0.0]]
        result = apply_risk_penalty(distances, [1.0, 1.0])
        assert result[0][0] == 0.0
        assert result[1][1] == 0.0

    def test_mismatched_lengths_rejected(self) -> None:
        with pytest.raises(ValueError):
            apply_risk_penalty([[0.0, 1.0], [1.0, 0.0]], [0.0])


class TestEstimateDurationSeconds:
    def test_zero_distance_zero_duration(self) -> None:
        assert estimate_duration_seconds(0.0) == 0.0

    def test_scales_with_distance(self) -> None:
        assert estimate_duration_seconds(80_000.0) == pytest.approx(
            2 * estimate_duration_seconds(40_000.0)
        )

    def test_negative_distance_rejected(self) -> None:
        with pytest.raises(ValueError):
            estimate_duration_seconds(-1.0)
