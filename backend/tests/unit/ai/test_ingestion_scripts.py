"""
tests/unit/ai/test_ingestion_scripts.py — Unit Tests for AI/ML Ingestion Script Pure Logic.

Tests only the pure parsing/computation helpers (no DB, no live IMD/GSI data,
no DEM raster required) — the thin async I/O wrappers in these scripts are
exercised manually against a live database, per Phase 1 verification notes.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest

from app.scripts.ingest_weather_features import (
    _build_weather_features_for_edge,
    _parse_rainfall_csv,
)
from app.scripts.load_landslide_catalog import _parse_landslide_catalog_csv


class TestBuildWeatherFeaturesForEdge:
    def test_computes_ari_and_rolling_sums(self) -> None:
        edge_id = uuid.uuid4()
        rows = [
            {"date": "2026-06-01", "rainfall_mm": "10"},
            {"date": "2026-06-02", "rainfall_mm": "20"},
            {"date": "2026-06-03", "rainfall_mm": "30"},
        ]
        result = _build_weather_features_for_edge(edge_id, rows)

        assert result.edge_id == edge_id
        assert result.rainfall_24h_mm == 30.0
        assert result.rainfall_48h_mm == 50.0  # 20 + 30
        assert result.rainfall_72h_mm == 60.0  # 10 + 20 + 30
        # ARI(recent-first=[30,20,10]) = 0.85*30 + 0.85^2*20 + 0.85^3*10
        assert result.ari_score == pytest.approx(0.85 * 30 + 0.85**2 * 20 + 0.85**3 * 10)

    def test_defaults_missing_optional_columns_to_zero(self) -> None:
        edge_id = uuid.uuid4()
        rows = [{"date": "2026-06-01", "rainfall_mm": "5"}]
        result = _build_weather_features_for_edge(edge_id, rows)
        assert result.forecast_rainfall_3h_mm == 0.0
        assert result.soil_moisture_index == 0.0

    def test_empty_rows_rejected(self) -> None:
        with pytest.raises(ValueError):
            _build_weather_features_for_edge(uuid.uuid4(), [])


class TestParseRainfallCsv:
    def test_groups_rows_by_edge_id(self, tmp_path: Path) -> None:
        edge_a = uuid.uuid4()
        edge_b = uuid.uuid4()
        csv_path = tmp_path / "rainfall.csv"
        csv_path.write_text(
            "edge_id,date,rainfall_mm\n"
            f"{edge_a},2026-06-01,10\n"
            f"{edge_a},2026-06-02,15\n"
            f"{edge_b},2026-06-01,5\n",
            encoding="utf-8",
        )

        rows_by_edge = _parse_rainfall_csv(csv_path)

        assert set(rows_by_edge.keys()) == {edge_a, edge_b}
        assert len(rows_by_edge[edge_a]) == 2
        assert len(rows_by_edge[edge_b]) == 1


class TestParseLandslideCatalogCsv:
    def test_parses_rows_with_generated_ids(self, tmp_path: Path) -> None:
        csv_path = tmp_path / "landslide.csv"
        csv_path.write_text(
            "longitude,latitude,occurred_at,source,severity\n"
            "91.75,26.15,2025-07-14T08:30:00+00:00,GSI_BHUSANKET,HIGH\n"
            "92.10,25.90,2025-08-02T03:00:00+00:00,SDMA,\n",
            encoding="utf-8",
        )

        events = _parse_landslide_catalog_csv(csv_path)

        assert len(events) == 2
        assert events[0].source == "GSI_BHUSANKET"
        assert events[0].severity == "HIGH"
        assert events[1].severity is None
        assert events[0].edge_id is None

    def test_respects_explicit_event_id(self, tmp_path: Path) -> None:
        fixed_id = uuid.uuid4()
        csv_path = tmp_path / "landslide.csv"
        csv_path.write_text(
            "event_id,longitude,latitude,occurred_at,source\n"
            f"{fixed_id},91.75,26.15,2025-07-14T08:30:00+00:00,GSI_BHUSANKET\n",
            encoding="utf-8",
        )

        events = _parse_landslide_catalog_csv(csv_path)

        assert events[0].id == fixed_id
