"""
app/modules/hazard/application/get_risk_overview.py — Use case for bounded spatial
risk zone queries returned as a GeoJSON FeatureCollection for map overlays.
"""

from __future__ import annotations

from typing import Any

from app.core.exceptions import ValidationError
from app.modules.hazard.application.ports import HazardRepositoryPort


class GetBoundedRiskZonesUseCase:
    """Queries risk zones within a geographic bounding box, joined with their latest assessment."""

    def __init__(self, hazard_repo: HazardRepositoryPort) -> None:
        self.hazard_repo = hazard_repo

    async def execute(
        self,
        min_lon: float,
        min_lat: float,
        max_lon: float,
        max_lat: float,
        limit: int = 500,
    ) -> dict[str, Any]:
        if min_lon > max_lon or min_lat > max_lat:
            raise ValidationError("Invalid bounding box: min coordinates must be <= max coordinates")

        capped_limit = min(limit, 500)

        zones = await self.hazard_repo.get_bounded_risk_zones(
            min_lon=min_lon,
            min_lat=min_lat,
            max_lon=max_lon,
            max_lat=max_lat,
            limit=capped_limit,
        )

        zone_ids = [z.id for z in zones]
        latest_assessments = await self.hazard_repo.get_latest_assessments_for_zones(zone_ids)

        features = []
        for zone in zones:
            assessment = latest_assessments.get(zone.id)

            if assessment:
                risk_level = assessment.risk_level.value
                risk_score = assessment.risk_score
                rainfall_24h = assessment.rainfall_mm_24h
                rainfall_72h = assessment.rainfall_mm_72h
                gradient_percent = assessment.contributing_factors.get(
                    "gradient_percent", zone.base_susceptibility * 40.0
                )
                computed_at = assessment.computed_at.isoformat()
            else:
                risk_level = "UNKNOWN"
                risk_score = None
                rainfall_24h = None
                rainfall_72h = None
                gradient_percent = zone.base_susceptibility * 40.0
                computed_at = None

            feature = {
                "type": "Feature",
                "id": str(zone.id),
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [zone.polygon_coordinates],
                },
                "properties": {
                    "id": str(zone.id),
                    "name": zone.name,
                    "risk_level": risk_level,
                    "risk_score": risk_score,
                    "rainfall_mm_24h": rainfall_24h,
                    "rainfall_mm_72h": rainfall_72h,
                    "gradient_percent": gradient_percent,
                    "computed_at": computed_at,
                },
            }
            features.append(feature)

        return {
            "type": "FeatureCollection",
            "features": features,
            "meta": {
                "count": len(features),
            },
        }
