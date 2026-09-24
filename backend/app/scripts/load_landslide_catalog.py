"""
app/scripts/load_landslide_catalog.py — Historical Landslide Catalog Loader.

Loads a CSV of historical landslide/disruption events (sourced from GSI
Bhusanket and/or State Disaster Management Authority records — see
`aiml developer.md` §2 Module 2) into `landslide_events`. These records are
the supervised-learning labels for Phase 2 model training; this script does
NOT attempt to match events to road edges (edge_id is left NULL) — that
spatial join is a Phase 2 training-time concern, not an ingestion-time one.

Expected CSV columns:
    event_id (optional, UUID; generated if blank), longitude, latitude,
    occurred_at (ISO 8601), source, severity (optional)

Usage:
    python -m app.scripts.load_landslide_catalog --csv-path data/landslide_events.csv
"""

from __future__ import annotations

import argparse
import asyncio
import csv
from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4

from app.core.db import AsyncSessionLocal
from app.modules.ai.domain.entities import LandslideEvent
from app.modules.ai.infrastructure.feature_store_repository import (
    SqlAlchemyFeatureStoreRepository,
)


def _parse_landslide_catalog_csv(csv_path: Path) -> list[LandslideEvent]:
    events: list[LandslideEvent] = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            event_id_raw = (row.get("event_id") or "").strip()
            events.append(
                LandslideEvent(
                    id=UUID(event_id_raw) if event_id_raw else uuid4(),
                    edge_id=None,
                    longitude=float(row["longitude"]),
                    latitude=float(row["latitude"]),
                    occurred_at=datetime.fromisoformat(row["occurred_at"]),
                    source=row["source"],
                    severity=(row.get("severity") or None) or None,
                )
            )
    return events


async def load_landslide_catalog(csv_path: Path) -> int:
    if not csv_path.exists():
        raise FileNotFoundError(f"Landslide catalog CSV not found at {csv_path}")

    events = _parse_landslide_catalog_csv(csv_path)

    async with AsyncSessionLocal() as db:
        feature_repo = SqlAlchemyFeatureStoreRepository(db)
        await feature_repo.save_landslide_events(events)
        await db.commit()

    return len(events)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--csv-path", type=Path, required=True, help="Path to the historical landslide catalog CSV"
    )
    args = parser.parse_args()

    count = asyncio.run(load_landslide_catalog(args.csv_path))
    print(f"Loaded {count} historical landslide events.")


if __name__ == "__main__":
    main()
