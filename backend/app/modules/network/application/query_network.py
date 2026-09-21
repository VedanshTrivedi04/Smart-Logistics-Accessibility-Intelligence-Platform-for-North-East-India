"""
app/modules/network/application/query_network.py — Use case for bounded spatial edge queries with zoom-level simplification.
"""

from __future__ import annotations

from typing import Any

from app.core.exceptions import ValidationError
from app.modules.network.application.ports import NetworkRepositoryPort
from app.modules.network.domain.entities import EdgeStatusCurrent, RoadEdge


class QueryBoundedEdgesUseCase:
    """Queries edges within a geographic bounding box, applying dynamic zoom simplification."""

    def __init__(self, network_repo: NetworkRepositoryPort) -> None:
        self.network_repo = network_repo

    async def execute(
        self,
        min_lon: float,
        min_lat: float,
        max_lon: float,
        max_lat: float,
        zoom: int | None = None,
        limit: int = 5000,
    ) -> dict[str, Any]:
        # Validate coordinates
        if min_lon > max_lon or min_lat > max_lat:
            raise ValidationError("Invalid bounding box: min coordinates must be <= max coordinates")

        # Capped feature count per Policy 10 (max 5,000 features)
        capped_limit = min(limit, 5000)

        # Dynamic simplification tolerance based on zoom level
        simplify_tolerance: float | None = None
        if zoom is not None:
            if zoom < 9:
                simplify_tolerance = 0.01  # ~1km simplification
            elif zoom < 12:
                simplify_tolerance = 0.002  # ~200m simplification

        # Query repository
        edge_results = await self.network_repo.get_bounded_edges(
            min_lon=min_lon,
            min_lat=min_lat,
            max_lon=max_lon,
            max_lat=max_lat,
            simplify_tolerance=simplify_tolerance,
            limit=capped_limit,
        )

        # Build GeoJSON FeatureCollection
        features = []
        for edge, status in edge_results:
            status_val = status.status.value if status else "OPEN"
            freshness_val = status.freshness.value if status else "FRESH"
            status_version = status.status_version if status else 1

            feature = {
                "type": "Feature",
                "id": str(edge.id),
                "geometry": {
                    "type": "LineString",
                    "coordinates": edge.coordinates,
                },
                "properties": {
                    "edge_index": edge.edge_index,
                    "road_class": edge.road_class.value,
                    "road_name": edge.road_name,
                    "surface_type": edge.surface_type.value,
                    "speed_limit_kmh": edge.speed_limit_kmh,
                    "length_meters": edge.length_meters,
                    "base_seconds": edge.base_seconds,
                    "is_one_way": edge.is_one_way,
                    "is_bridge": edge.is_bridge,
                    "accessibility_status": status_val,
                    "freshness": freshness_val,
                    "status_version": status_version,
                },
            }
            features.append(feature)

        return {
            "type": "FeatureCollection",
            "features": features,
            "meta": {
                "count": len(features),
                "zoom": zoom,
                "simplified": simplify_tolerance is not None,
            },
        }
