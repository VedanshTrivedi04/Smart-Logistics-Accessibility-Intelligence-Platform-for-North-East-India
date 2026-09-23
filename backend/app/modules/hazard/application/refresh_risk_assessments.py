"""
app/modules/hazard/application/refresh_risk_assessments.py — Use case to refresh live
rainfall observations and recompute risk assessments for risk zones.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.core.logging import get_logger
from app.modules.hazard.application.ports import HazardRepositoryPort, WeatherProviderPort
from app.modules.hazard.domain.entities import RainfallObservation, RiskAssessment
from app.modules.hazard.domain.risk_scoring import compute_risk_score, score_to_level

logger = get_logger(__name__)

# Default sweep bounding box (full North-East India) when no bbox is supplied.
_DEFAULT_MIN_LON = 89.0
_DEFAULT_MIN_LAT = 22.0
_DEFAULT_MAX_LON = 97.5
_DEFAULT_MAX_LAT = 29.5


class RefreshRiskAssessmentsUseCase:
    """
    Fetches live rainfall for each risk zone (bounded, or the full NER extent by
    default), persists the observation, and recomputes+persists a fresh
    RiskAssessment combining terrain susceptibility with rainfall intensity.

    Note on the gradient figure used for scoring: RiskZone only carries
    `base_susceptibility` (0.0-1.0, normalized as gradient_percent / 40.0 at
    creation time — see SeedRiskZonesFromNetworkUseCase). To keep scoring
    internally consistent without re-fetching the source road edge, we invert
    that normalization here (`base_susceptibility * 40.0`) to recover an
    equivalent gradient-percent figure to feed into `compute_risk_score`.
    """

    def __init__(self, hazard_repo: HazardRepositoryPort, weather_provider: WeatherProviderPort) -> None:
        self.hazard_repo = hazard_repo
        self.weather_provider = weather_provider

    async def execute(
        self,
        min_lon: float | None = None,
        min_lat: float | None = None,
        max_lon: float | None = None,
        max_lat: float | None = None,
    ) -> int:
        bbox = (
            min_lon if min_lon is not None else _DEFAULT_MIN_LON,
            min_lat if min_lat is not None else _DEFAULT_MIN_LAT,
            max_lon if max_lon is not None else _DEFAULT_MAX_LON,
            max_lat if max_lat is not None else _DEFAULT_MAX_LAT,
        )

        zones = await self.hazard_repo.get_bounded_risk_zones(
            min_lon=bbox[0],
            min_lat=bbox[1],
            max_lon=bbox[2],
            max_lat=bbox[3],
            limit=5000,
        )

        refreshed = 0
        now = datetime.now(timezone.utc)

        for zone in zones:
            try:
                rainfall = await self.weather_provider.get_rainfall(zone.centroid_lat, zone.centroid_lon)
            except Exception as exc:
                logger.warning(
                    "hazard_rainfall_fetch_failed",
                    risk_zone_id=str(zone.id),
                    error=str(exc),
                )
                rainfall = {"rainfall_mm_1h": 0.0, "rainfall_mm_24h": 0.0, "rainfall_mm_72h": 0.0}

            rainfall_1h = rainfall.get("rainfall_mm_1h", 0.0)
            rainfall_24h = rainfall.get("rainfall_mm_24h", 0.0)
            rainfall_72h = rainfall.get("rainfall_mm_72h", 0.0)

            observation = RainfallObservation(
                id=uuid.uuid4(),
                risk_zone_id=zone.id,
                rainfall_mm_1h=rainfall_1h,
                rainfall_mm_24h=rainfall_24h,
                rainfall_mm_72h=rainfall_72h,
                observed_at=now,
                source="open-meteo",
            )
            await self.hazard_repo.save_rainfall_observation(observation)

            equivalent_gradient_percent = zone.base_susceptibility * 40.0
            score = compute_risk_score(
                gradient_percent=equivalent_gradient_percent,
                rainfall_mm_24h=rainfall_24h,
                rainfall_mm_72h=rainfall_72h,
            )
            level = score_to_level(score)

            assessment = RiskAssessment(
                id=uuid.uuid4(),
                risk_zone_id=zone.id,
                risk_level=level,
                risk_score=score,
                rainfall_mm_24h=rainfall_24h,
                rainfall_mm_72h=rainfall_72h,
                computed_at=now,
                contributing_factors={
                    "gradient_percent": equivalent_gradient_percent,
                    "rainfall_mm_1h": rainfall_1h,
                    "rainfall_mm_24h": rainfall_24h,
                    "rainfall_mm_72h": rainfall_72h,
                },
            )
            await self.hazard_repo.save_risk_assessment(assessment)
            refreshed += 1

        return refreshed
