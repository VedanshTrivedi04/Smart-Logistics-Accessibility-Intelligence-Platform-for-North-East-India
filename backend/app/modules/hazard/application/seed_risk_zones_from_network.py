"""
app/modules/hazard/application/seed_risk_zones_from_network.py — Use case to derive
landslide risk zones from steep road-network edges.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.modules.hazard.application.ports import HazardRepositoryPort
from app.modules.hazard.domain.entities import RiskZone
from app.modules.hazard.domain.enums import RiskZoneSource
from app.modules.hazard.domain.risk_scoring import derive_polygon_ring
from app.modules.network.public import NetworkRepositoryPort

# Full North-East India bounding box used to sweep the active network graph.
NER_MIN_LON = 89.0
NER_MIN_LAT = 22.0
NER_MAX_LON = 97.5
NER_MAX_LAT = 29.5


class SeedRiskZonesFromNetworkUseCase:
    """
    Derives terrain-based landslide risk zones from road edges whose gradient
    exceeds a threshold. Idempotent: does nothing if risk zones already exist,
    so this can be safely called from a startup hook or an admin endpoint.
    """

    def __init__(self, hazard_repo: HazardRepositoryPort, network_repo: NetworkRepositoryPort) -> None:
        self.hazard_repo = hazard_repo
        self.network_repo = network_repo

    async def execute(self, gradient_threshold_percent: float = 12.0) -> int:
        if await self.hazard_repo.has_any_risk_zones():
            return 0

        edge_results = await self.network_repo.get_bounded_edges(
            min_lon=NER_MIN_LON,
            min_lat=NER_MIN_LAT,
            max_lon=NER_MAX_LON,
            max_lat=NER_MAX_LAT,
            limit=5000,
        )

        now = datetime.now(timezone.utc)
        zones: list[RiskZone] = []

        for edge, _status in edge_results:
            if edge.gradient_percent < gradient_threshold_percent:
                continue
            if not edge.coordinates:
                continue

            # Midpoint coordinate of the edge's LineString as the zone centroid
            mid_index = len(edge.coordinates) // 2
            centroid_lon, centroid_lat = edge.coordinates[mid_index]

            base_susceptibility = min(edge.gradient_percent / 40.0, 1.0)
            ring = derive_polygon_ring(centroid_lon, centroid_lat)

            zone_name = edge.road_name or f"Steep segment {edge.edge_index}"

            zones.append(
                RiskZone(
                    id=uuid.uuid4(),
                    name=f"Landslide risk zone — {zone_name}",
                    jurisdiction_id=edge.jurisdiction_id,
                    source=RiskZoneSource.TERRAIN_DERIVED,
                    base_susceptibility=base_susceptibility,
                    centroid_lon=centroid_lon,
                    centroid_lat=centroid_lat,
                    polygon_coordinates=ring,
                    related_edge_id=edge.id,
                    created_at=now,
                )
            )

        if zones:
            await self.hazard_repo.save_risk_zones(zones)

        return len(zones)
