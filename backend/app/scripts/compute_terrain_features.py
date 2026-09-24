"""
app/scripts/compute_terrain_features.py — DEM-Based Static Terrain Feature Extraction.

One-off CLI script (not a recurring worker): samples a SRTM/Copernicus DEM
GeoTIFF along every road edge's linestring geometry and writes elevation,
slope, aspect, and curvature features into `edge_terrain_features`.

Requires the `ml` extra: `pip install -e ".[ml]"` (rasterio, geopandas).

Usage:
    python -m app.scripts.compute_terrain_features --dem-path data/srtm_ne_india.tif

KNOWN GAP (tracked as a Phase 1 follow-up, not blocking): `distance_to_stream_m`
and `susceptibility_zone` currently use placeholder/heuristic values because no
hydrology layer or GSI Bhusanket susceptibility overlay has been sourced yet.
Once those datasets are available, replace `_PLACEHOLDER_DISTANCE_TO_STREAM_M`
below with a real nearest-stream spatial join, and swap
`feature_math.classify_susceptibility_zone_by_slope` for a GSI polygon lookup.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import UTC, datetime
from pathlib import Path

from app.core.db import AsyncSessionLocal
from app.modules.ai.domain.feature_math import build_terrain_features
from app.modules.ai.infrastructure.feature_store_repository import (
    SqlAlchemyFeatureStoreRepository,
)
from app.modules.network.domain.entities import RoadEdge
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository

# North-Eastern Region bounding box (matches reporting/domain/entities.py NER bounds).
NER_BBOX = (89.5, 21.5, 97.5, 29.5)  # (min_lon, min_lat, max_lon, max_lat)

# Placeholder until a real hydrology/drainage layer is sourced (see module docstring).
_PLACEHOLDER_DISTANCE_TO_STREAM_M = 500.0


def _sample_elevations(dem_path: Path, coordinates: list[tuple[float, float]]) -> list[float]:
    """Sample a DEM raster's band-1 elevation at each (lon, lat) coordinate."""
    import rasterio  # imported lazily so the module can be imported without the `ml` extra

    with rasterio.open(dem_path) as dataset:
        samples = list(dataset.sample(coordinates))
    return [float(s[0]) for s in samples]


async def compute_terrain_features_for_all_edges(dem_path: Path, batch_size: int = 500) -> int:
    if not dem_path.exists():
        raise FileNotFoundError(f"DEM raster not found at {dem_path}")

    written = 0
    async with AsyncSessionLocal() as db:
        network_repo = SqlAlchemyNetworkRepository(db)
        feature_repo = SqlAlchemyFeatureStoreRepository(db)

        min_lon, min_lat, max_lon, max_lat = NER_BBOX
        edge_status_pairs = await network_repo.get_bounded_edges(
            min_lon=min_lon,
            min_lat=min_lat,
            max_lon=max_lon,
            max_lat=max_lat,
            limit=5000,
        )
        edges: list[RoadEdge] = [edge for edge, _status in edge_status_pairs]

        now = datetime.now(UTC)
        batch = []
        for edge in edges:
            elevations = _sample_elevations(dem_path, edge.coordinates)
            features = build_terrain_features(
                edge_id=edge.id,
                coordinates=edge.coordinates,
                length_meters=edge.length_meters,
                elevations_m=elevations,
                distance_to_stream_m=_PLACEHOLDER_DISTANCE_TO_STREAM_M,
                computed_at=now,
            )
            batch.append(features)

            if len(batch) >= batch_size:
                await feature_repo.save_terrain_features(batch)
                written += len(batch)
                batch = []

        if batch:
            await feature_repo.save_terrain_features(batch)
            written += len(batch)

        await db.commit()

    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dem-path",
        type=Path,
        required=True,
        help="Path to a SRTM/Copernicus DEM GeoTIFF covering the NER bounding box",
    )
    args = parser.parse_args()

    count = asyncio.run(compute_terrain_features_for_all_edges(args.dem_path))
    print(f"Computed terrain features for {count} road edges.")


if __name__ == "__main__":
    main()
