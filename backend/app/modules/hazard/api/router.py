"""
app/modules/hazard/api/router.py — FastAPI Router for Landslide Risk & Rainfall Hazard Endpoints.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, status

from app.core.db import DbSession as AsyncSession, get_db
from app.core.security import require_capability
from app.modules.hazard.api.schemas import RiskZoneRefreshResponse, RiskZoneSeedResponse
from app.modules.hazard.application.get_risk_overview import GetBoundedRiskZonesUseCase
from app.modules.hazard.application.refresh_risk_assessments import RefreshRiskAssessmentsUseCase
from app.modules.hazard.application.seed_risk_zones_from_network import (
    SeedRiskZonesFromNetworkUseCase,
)
from app.modules.hazard.infrastructure.repository import SqlAlchemyHazardRepository
from app.modules.hazard.infrastructure.weather_client import OpenMeteoWeatherClient
from app.modules.identity.domain.enums import Capability
from app.modules.identity.domain.principal import PrincipalContext
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository

router = APIRouter(tags=["Hazard & Landslide Risk"])


# ─────────────────────────────────────────────────────────────────
# 1. Bounded Risk Zones (GeoJSON Map Overlay)
# ─────────────────────────────────────────────────────────────────
@router.get(
    "/hazard/risk-zones",
    summary="Get landslide risk zones within geographic bounding box",
    response_model=dict[str, Any],
)
async def get_bounded_risk_zones(
    min_lon: float = Query(..., ge=-180.0, le=180.0, description="Minimum longitude"),
    min_lat: float = Query(..., ge=-90.0, le=90.0, description="Minimum latitude"),
    max_lon: float = Query(..., ge=-180.0, le=180.0, description="Maximum longitude"),
    max_lat: float = Query(..., ge=-90.0, le=90.0, description="Maximum latitude"),
    limit: int = Query(500, ge=1, le=500, description="Maximum features to return"),
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.VIEW_ROAD_STATUS)),
) -> dict[str, Any]:
    repo = SqlAlchemyHazardRepository(db)
    use_case = GetBoundedRiskZonesUseCase(repo)
    return await use_case.execute(
        min_lon=min_lon,
        min_lat=min_lat,
        max_lon=max_lon,
        max_lat=max_lat,
        limit=limit,
    )


# ─────────────────────────────────────────────────────────────────
# 2. Refresh Rainfall & Risk Assessments
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/hazard/risk-zones/refresh",
    summary="Refresh live rainfall and recompute landslide risk assessments (authorized only)",
    response_model=RiskZoneRefreshResponse,
    status_code=status.HTTP_200_OK,
)
async def refresh_risk_assessments(
    min_lon: float | None = Query(None, ge=-180.0, le=180.0, description="Optional bbox min longitude"),
    min_lat: float | None = Query(None, ge=-90.0, le=90.0, description="Optional bbox min latitude"),
    max_lon: float | None = Query(None, ge=-180.0, le=180.0, description="Optional bbox max longitude"),
    max_lat: float | None = Query(None, ge=-90.0, le=90.0, description="Optional bbox max latitude"),
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.UPDATE_ROAD_STATUS)),
) -> RiskZoneRefreshResponse:
    hazard_repo = SqlAlchemyHazardRepository(db)
    weather_provider = OpenMeteoWeatherClient()
    use_case = RefreshRiskAssessmentsUseCase(hazard_repo=hazard_repo, weather_provider=weather_provider)

    count = await use_case.execute(
        min_lon=min_lon,
        min_lat=min_lat,
        max_lon=max_lon,
        max_lat=max_lat,
    )
    await db.commit()

    return RiskZoneRefreshResponse(zones_refreshed=count)


# ─────────────────────────────────────────────────────────────────
# 3. Seed Terrain-Derived Risk Zones
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/hazard/risk-zones/seed",
    summary="Derive landslide risk zones from steep road-network edges (authorized only, idempotent)",
    response_model=RiskZoneSeedResponse,
    status_code=status.HTTP_200_OK,
)
async def seed_risk_zones(
    gradient_threshold_percent: float = Query(
        12.0, ge=0.0, le=100.0, description="Minimum road-edge gradient percent to seed a risk zone"
    ),
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.UPDATE_ROAD_STATUS)),
) -> RiskZoneSeedResponse:
    hazard_repo = SqlAlchemyHazardRepository(db)
    network_repo = SqlAlchemyNetworkRepository(db)
    use_case = SeedRiskZonesFromNetworkUseCase(hazard_repo=hazard_repo, network_repo=network_repo)

    count = await use_case.execute(gradient_threshold_percent=gradient_threshold_percent)
    await db.commit()

    return RiskZoneSeedResponse(zones_created=count)
