"""
tests/unit/ai/test_eta_predictor.py — CatBoost ETA predictor: band, provenance, model sanity.

The band logic and provenance use a tiny fake model, so they run without the artifact. The sanity
tests use the
real NE-calibrated model and are skipped when the (git-ignored) artifact is absent.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from app.modules.ai.domain.enums import ModelStatus
from app.modules.ai.infrastructure import catboost_eta_predictor as eta_module
from app.modules.ai.infrastructure.catboost_eta_predictor import CatboostEtaPredictor

EDGE: dict[str, float] = {
    "length_km": 8.0,
    "elevation_gain_m": 250.0,
    "tortuosity_index": 1.4,
    "rainfall_rate_mmhr": 0.0,
    "vehicle_weight_kg": 12000.0,
}


class _FakeModel:
    def __init__(self, seconds_per_edge: float) -> None:
        self.seconds_per_edge = seconds_per_edge

    def predict(self, rows: Any) -> np.ndarray:
        return np.full(len(rows), self.seconds_per_edge)


def _predictor(tmp_path: Path, metrics: dict[str, Any] | None, seconds_per_edge: float = 600.0):  # type: ignore[no-untyped-def]
    p = CatboostEtaPredictor.__new__(CatboostEtaPredictor)  # skip loading a real .cbm
    p.model = _FakeModel(seconds_per_edge)
    p.residual_std_seconds = 0.0
    p.route_relative_std = 0.0
    p.training_data = None
    if metrics is not None:
        p.residual_std_seconds = float(metrics.get("residual_std_seconds", 0.0))
        p.route_relative_std = float(metrics.get("route_relative_std", 0.0))
        p.training_data = metrics.get("provenance")
    return p


class TestConfidenceBand:
    async def test_relative_route_spread_dominates_for_long_routes(self, tmp_path: Path) -> None:
        p = _predictor(tmp_path, {"residual_std_seconds": 100.0, "route_relative_std": 0.15})
        r = await p.estimate(
            [EDGE] * 20
        )  # total 12000 s; sqrt(20)*100 = 447 s < 0.15*12000 = 1800 s
        assert r.upper_bound_seconds - r.total_seconds == pytest.approx(1800.0)
        assert r.total_seconds - r.lower_bound_seconds == pytest.approx(1800.0)

    async def test_independent_error_term_still_applies_when_larger(self, tmp_path: Path) -> None:
        p = _predictor(tmp_path, {"residual_std_seconds": 900.0, "route_relative_std": 0.01})
        r = await p.estimate([EDGE] * 4)  # 900*2 = 1800 s vs 0.01*2400 = 24 s
        assert r.upper_bound_seconds - r.total_seconds == pytest.approx(900.0 * math.sqrt(4))

    async def test_lower_bound_never_negative(self, tmp_path: Path) -> None:
        p = _predictor(tmp_path, {"route_relative_std": 5.0}, seconds_per_edge=10.0)
        assert (await p.estimate([EDGE])).lower_bound_seconds == 0.0

    async def test_old_metrics_without_route_spread_keep_previous_behaviour(
        self, tmp_path: Path
    ) -> None:
        p = _predictor(tmp_path, {"residual_std_seconds": 100.0})
        r = await p.estimate([EDGE] * 9)
        assert r.upper_bound_seconds - r.total_seconds == pytest.approx(300.0)


class TestProvenance:
    async def test_training_data_is_reported(self, tmp_path: Path) -> None:
        p = _predictor(tmp_path, {"provenance": "SYNTHETIC_NE_CALIBRATED"})
        r = await p.estimate([EDGE])
        assert r.training_data == "SYNTHETIC_NE_CALIBRATED" and r.model_status is ModelStatus.LOADED

    async def test_unknown_provenance_is_none(self, tmp_path: Path) -> None:
        assert (await _predictor(tmp_path, None).estimate([EDGE])).training_data is None

    def test_constructor_reads_metrics_file(self, tmp_path: Path) -> None:
        if not eta_module.MODEL_PATH.exists():
            pytest.skip("eta model artifact not present")
        metrics = tmp_path / "m.json"
        metrics.write_text(
            json.dumps({"provenance": "X", "route_relative_std": 0.2, "residual_std_seconds": 5.0})
        )
        p = CatboostEtaPredictor(eta_module.MODEL_PATH, metrics)
        assert (
            p.training_data == "X" and p.route_relative_std == 0.2 and p.residual_std_seconds == 5.0
        )


@pytest.mark.skipif(
    not eta_module.MODEL_PATH.exists(), reason="eta_model_catboost.cbm not present (gitignored)"
)
class TestRealModelSanity:
    @pytest.fixture
    def predictor(self) -> CatboostEtaPredictor:
        return CatboostEtaPredictor(eta_module.MODEL_PATH, eta_module.METRICS_PATH)

    async def _t(self, predictor: CatboostEtaPredictor, **over: float) -> float:
        return (await predictor.estimate([{**EDGE, **over}])).total_seconds

    async def test_is_the_ne_calibrated_model_with_route_spread(
        self, predictor: CatboostEtaPredictor
    ) -> None:
        assert predictor.training_data == "SYNTHETIC_NE_CALIBRATED"
        assert 0.05 <= predictor.route_relative_std <= 0.4

    async def test_monotone_in_every_feature(self, predictor: CatboostEtaPredictor) -> None:
        sweeps = {
            "length_km": [1.0, 5.0, 20.0, 50.0],
            "elevation_gain_m": [0.0, 100.0, 400.0, 1200.0],
            "tortuosity_index": [1.0, 1.5, 2.5, 4.0],
            "rainfall_rate_mmhr": [0.0, 5.0, 20.0, 50.0],
            "vehicle_weight_kg": [1800.0, 6000.0, 12000.0, 24000.0],
        }
        for feature, values in sweeps.items():
            times = [await self._t(predictor, **{feature: v}) for v in values]
            assert times == sorted(times), f"{feature} not monotone: {times}"

    async def test_physical_orderings(self, predictor: CatboostEtaPredictor) -> None:
        base = await self._t(predictor)
        assert await self._t(predictor, vehicle_weight_kg=1800.0) < await self._t(
            predictor, vehicle_weight_kg=24000.0
        )
        assert 1.05 <= await self._t(predictor, rainfall_rate_mmhr=20.0) / base <= 1.4
        assert await self._t(predictor, elevation_gain_m=800.0) > 1.1 * await self._t(
            predictor, elevation_gain_m=0.0
        )

    async def test_hill_speed_is_plausible_for_a_truck(
        self, predictor: CatboostEtaPredictor
    ) -> None:
        speed_kmh = EDGE["length_km"] / (await self._t(predictor) / 3600.0)
        assert 10.0 <= speed_kmh <= 40.0

    async def test_guwahati_shillong_scale_is_realistic(
        self, predictor: CatboostEtaPredictor
    ) -> None:
        """~99 km, ~1.6 km of climbing, reference car, 10 km edges: published time is 2.5-3.5 h."""
        edges = [
            {
                "length_km": 9.9,
                "elevation_gain_m": 165.0,
                "tortuosity_index": 1.25,
                "rainfall_rate_mmhr": 0.0,
                "vehicle_weight_kg": 1800.0,
            }
        ] * 10
        hours = (await predictor.estimate(edges)).total_seconds / 3600.0
        assert 2.2 <= hours <= 4.5, f"{hours:.2f} h"
