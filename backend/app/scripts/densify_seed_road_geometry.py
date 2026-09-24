"""
app/scripts/densify_seed_road_geometry.py — Replace straight-line seed road geometry
with real street-following shape from OSRM.

The demo road network stores every edge as a 2-point straight line between its two
endpoints — fine for the routing math (Dijkstra/KSP run on source/target node indices
with a precomputed cost, never on geometry), but it makes computed routes look like
they cut across open country instead of following an actual road.

This is a one-time data-enrichment script, not a runtime dependency. It calls the
public OSRM demo server (router.project-osrm.org — free, no key, meant for light/
non-commercial use) once per edge to fetch a real driving polyline between the edge's
two nodes, then stores that polyline as the edge's geometry, with distance and
duration recomputed to match. The routing engine itself is unchanged: still our own
pgRouting/Dijkstra graph with every bridge/hazmat/curfew/road-status constraint
intact — OSRM is used here only once, as a source of realistic street shape.

OSRM occasionally snaps a coordinate to the wrong nearby road (seen once on a short
bridge-crossing edge here, where it returned a 14 m "route" for two nodes 1.1 km
apart) — a real driving distance can never be shorter than the geodesic straight-line
distance between its endpoints, so any OSRM answer that violates that, or that is
implausibly long (over 5x straight-line, well beyond even a switchback mountain
road), is rejected and that edge keeps a straight line instead of a wrong shape.

Safe to re-run — every distance/duration is recomputed from the current node
positions and speed limit each time, not from whatever is already stored, so a
previous bad run self-corrects rather than compounding. Each run makes about one
request per second to a shared public server (19 edges today); don't run it in a
loop or point it at a much larger network without switching to a self-hosted OSRM
instance or a bulk OSM extract instead.
"""

from __future__ import annotations

import asyncio
import math
from uuid import UUID

import httpx
from geoalchemy2.functions import ST_X, ST_Y, ST_GeomFromText
from sqlalchemy import select, update

from app.core.db import AsyncSessionLocal
from app.core.logging import get_logger
from app.modules.network.infrastructure.models import RoadEdgeModel, RoadNodeModel

logger = get_logger(__name__)

_OSRM_BASE_URL = "http://router.project-osrm.org/route/v1/driving"
_REQUEST_TIMEOUT_SECONDS = 15.0
_DELAY_BETWEEN_REQUESTS_SECONDS = 1.0
_EARTH_RADIUS_M = 6371000.0

# An OSRM answer outside this ratio of the straight-line distance is treated as a bad
# snap rather than a real road, and the edge falls back to a straight line.
_MIN_PLAUSIBLE_RATIO = 0.95
_MAX_PLAUSIBLE_RATIO = 5.0


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lambda / 2) ** 2
    return _EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _fetch_osrm_geometry(
    client: httpx.AsyncClient, lon1: float, lat1: float, lon2: float, lat2: float
) -> tuple[list[tuple[float, float]], float] | None:
    """The real street-following path OSRM finds between two points, or None if OSRM
    has no route there (for example a stretch of hill road too new for its map data)."""
    url = f"{_OSRM_BASE_URL}/{lon1},{lat1};{lon2},{lat2}"
    try:
        params = {"overview": "full", "geometries": "geojson"}
        resp = await client.get(url, params=params, timeout=_REQUEST_TIMEOUT_SECONDS)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("osrm_request_failed", error=str(exc))
        return None
    if data.get("code") != "Ok" or not data.get("routes"):
        return None
    route = data["routes"][0]
    coords = route["geometry"]["coordinates"]
    if len(coords) < 2:
        return None
    return [(float(c[0]), float(c[1])) for c in coords], float(route["distance"])


async def densify() -> None:
    async with AsyncSessionLocal() as session:
        node_stmt = select(RoadNodeModel.id, ST_X(RoadNodeModel.geom), ST_Y(RoadNodeModel.geom))
        node_rows = (await session.execute(node_stmt)).all()
        node_coords: dict[UUID, tuple[float, float]] = {r[0]: (r[1], r[2]) for r in node_rows}

        edge_stmt = select(
            RoadEdgeModel.id,
            RoadEdgeModel.road_name,
            RoadEdgeModel.source_node_id,
            RoadEdgeModel.target_node_id,
            RoadEdgeModel.speed_limit_kmh,
            RoadEdgeModel.reverse_base_seconds,
        )
        edge_rows = (await session.execute(edge_stmt)).all()

        updated = 0
        rejected = 0
        async with httpx.AsyncClient() as client:
            for row in edge_rows:
                src_lon, src_lat = node_coords[row.source_node_id]
                tgt_lon, tgt_lat = node_coords[row.target_node_id]
                name = row.road_name or str(row.id)
                straight_line_m = _haversine_meters(src_lat, src_lon, tgt_lat, tgt_lon)

                result = await _fetch_osrm_geometry(client, src_lon, src_lat, tgt_lon, tgt_lat)
                await asyncio.sleep(_DELAY_BETWEEN_REQUESTS_SECONDS)

                coords: list[tuple[float, float]] = [(src_lon, src_lat), (tgt_lon, tgt_lat)]
                new_length_m = straight_line_m
                shape = "straight line"

                if result is not None:
                    osrm_coords, osrm_length_m = result
                    ratio = osrm_length_m / straight_line_m if straight_line_m > 0 else 0.0
                    if _MIN_PLAUSIBLE_RATIO <= ratio <= _MAX_PLAUSIBLE_RATIO:
                        # Snap the endpoints exactly onto our own nodes (OSRM snaps to
                        # the nearest real road, which can be a few metres off) so
                        # adjacent edges still share an identical coordinate and the
                        # merged route line has no gaps.
                        osrm_coords[0] = (src_lon, src_lat)
                        osrm_coords[-1] = (tgt_lon, tgt_lat)
                        coords = osrm_coords
                        new_length_m = osrm_length_m
                        shape = f"{len(coords)} pts"
                    else:
                        osrm_m, straight_m = osrm_length_m, straight_line_m
                        print(f"[reject] {name}: OSRM {osrm_m:.0f}m vs straight {straight_m:.0f}m ({ratio:.2f}x)")
                        rejected += 1

                points_str = ", ".join(f"{lon} {lat}" for lon, lat in coords)
                wkt = f"SRID=4326;LINESTRING({points_str})"
                speed_mps = row.speed_limit_kmh * 1000.0 / 3600.0
                new_base_seconds = new_length_m / speed_mps if speed_mps > 0 else new_length_m
                was_one_way = row.reverse_base_seconds is not None and row.reverse_base_seconds <= 0
                new_reverse_seconds = row.reverse_base_seconds if was_one_way else new_base_seconds

                values = {
                    "geom": ST_GeomFromText(wkt, 4326),
                    "length_meters": new_length_m,
                    "base_seconds": new_base_seconds,
                    "reverse_base_seconds": new_reverse_seconds,
                }
                stmt = update(RoadEdgeModel).where(RoadEdgeModel.id == row.id).values(**values)
                await session.execute(stmt)
                print(f"[ok] {name}: {shape}, {new_length_m:.0f}m")
                updated += 1

        await session.commit()
        print(f"Done. {updated} edges updated ({rejected} OSRM matches rejected as implausible).")


if __name__ == "__main__":
    asyncio.run(densify())
