"""
app/scripts/ingest_weather_features.py — Rainfall/ARI Feature Ingestion.

Reads a per-edge daily rainfall CSV (produced by an upstream IMD gridded-data
extraction step — out of scope for this script) and computes the Antecedent
Rainfall Index plus rolling rainfall sums, writing results into
`edge_weather_features`. Intended to run on a schedule (e.g. daily via cron or
the Phase 4 Celery worker), not as a one-off like the DEM script.

Expected CSV columns (one row per edge per day, ascending date order):
    edge_id, date (YYYY-MM-DD), rainfall_mm, forecast_3h_mm, forecast_6h_mm,
    forecast_12h_mm, soil_moisture_index

Usage:
    python -m app.scripts.ingest_weather_features --csv-path data/imd_rainfall.csv
"""

from __future__ import annotations

import argparse
import asyncio
import csv
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from app.core.db import AsyncSessionLocal
from app.modules.ai.domain.entities import WeatherFeatures
from app.modules.ai.domain.feature_math import compute_antecedent_rainfall_index
from app.modules.ai.infrastructure.feature_store_repository import (
    SqlAlchemyFeatureStoreRepository,
)


def _parse_rainfall_csv(csv_path: Path) -> dict[UUID, list[dict[str, str]]]:
    """Group CSV rows by edge_id, preserving file order (assumed ascending by date)."""
    rows_by_edge: dict[UUID, list[dict[str, str]]] = defaultdict(list)
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows_by_edge[UUID(row["edge_id"])].append(row)
    return rows_by_edge


def _build_weather_features_for_edge(
    edge_id: UUID,
    rows: list[dict[str, str]],
) -> WeatherFeatures:
    """
    Build a single WeatherFeatures observation from an edge's rainfall history.

    `rows` must be in ascending date order; the ARI and rolling sums are
    computed as of the most recent (last) row.
    """
    if not rows:
        raise ValueError("rows must not be empty")

    daily_rainfall_ascending = [float(r["rainfall_mm"]) for r in rows]
    # ARI formula expects most-recent-first ordering.
    daily_rainfall_recent_first = list(reversed(daily_rainfall_ascending))

    ari_score = compute_antecedent_rainfall_index(daily_rainfall_recent_first)
    rainfall_24h = daily_rainfall_ascending[-1] if daily_rainfall_ascending else 0.0
    rainfall_48h = sum(daily_rainfall_ascending[-2:])
    rainfall_72h = sum(daily_rainfall_ascending[-3:])

    latest = rows[-1]
    observed_at = datetime.strptime(latest["date"], "%Y-%m-%d").replace(tzinfo=UTC)

    return WeatherFeatures(
        edge_id=edge_id,
        observed_at=observed_at,
        rainfall_24h_mm=rainfall_24h,
        rainfall_48h_mm=rainfall_48h,
        rainfall_72h_mm=rainfall_72h,
        ari_score=ari_score,
        forecast_rainfall_3h_mm=float(latest.get("forecast_3h_mm", 0.0) or 0.0),
        forecast_rainfall_6h_mm=float(latest.get("forecast_6h_mm", 0.0) or 0.0),
        forecast_rainfall_12h_mm=float(latest.get("forecast_12h_mm", 0.0) or 0.0),
        soil_moisture_index=float(latest.get("soil_moisture_index", 0.0) or 0.0),
    )


async def ingest_weather_features(csv_path: Path) -> int:
    if not csv_path.exists():
        raise FileNotFoundError(f"Rainfall CSV not found at {csv_path}")

    rows_by_edge = _parse_rainfall_csv(csv_path)
    features = [
        _build_weather_features_for_edge(edge_id, rows) for edge_id, rows in rows_by_edge.items()
    ]

    async with AsyncSessionLocal() as db:
        feature_repo = SqlAlchemyFeatureStoreRepository(db)
        await feature_repo.save_weather_features(features)
        await db.commit()

    return len(features)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--csv-path", type=Path, required=True, help="Path to per-edge rainfall CSV"
    )
    args = parser.parse_args()

    count = asyncio.run(ingest_weather_features(args.csv_path))
    print(f"Ingested weather features for {count} road edges.")


if __name__ == "__main__":
    main()
