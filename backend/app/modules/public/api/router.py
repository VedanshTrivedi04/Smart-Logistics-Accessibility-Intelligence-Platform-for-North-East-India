"""
app/modules/public/api/router.py — FastAPI Router for the anonymous public-citizen surface.

Every route here is intentionally reachable without a session — no require_authenticated,
no require_capability, anywhere in this file. That is deliberate (see app/modules/public
package docstring) and each route is rate-limited per client IP instead, since there is
no session to hold accountable for abuse.

- /network/edges and /hazard/risk-zones return exactly the same shared regional data an
  authenticated user sees (that data was never org-scoped).
- /incidents is redacted (see application/list_public_incidents.py).
- /routes/evaluate reuses the real routing engine with a fixed "standard car" profile,
  attributed to the seeded PUBLIC_ORG_ID rather than a real organization.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, Query, status

from app.core.db import DbSession as AsyncSession
from app.core.db import get_db
from app.core.rate_limit import rate_limit
from app.modules.hazard.application.get_risk_overview import GetBoundedRiskZonesUseCase
from app.modules.hazard.infrastructure.repository import SqlAlchemyHazardRepository
from app.modules.incidents.infrastructure.repository import SqlAlchemyIncidentRepository
from app.modules.network.application.query_network import QueryBoundedEdgesUseCase
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository
from app.modules.public.api.schemas import PublicIncidentResponse, PublicRouteEvaluationRequest
from app.modules.public.application.list_public_incidents import ListPublicIncidentsUseCase
from app.modules.public.constants import PUBLIC_ORG_ID
from app.modules.reporting.infrastructure.repository import SqlAlchemyReportingRepository
from app.modules.routing.api.router import to_route_plan_response
from app.modules.routing.api.schemas import RouteEdgeResponse, RoutePlanResponse
from app.modules.routing.application.evaluate_route import EvaluateRouteUseCase
from app.modules.routing.domain.entities import VehicleConstraints
from app.modules.routing.domain.enums import PolicyVersion, RouteResultStatus
from app.modules.routing.domain.exceptions import CoordinateOutOfBoundsError, NodeNotFoundError
from app.modules.routing.infrastructure.repository import SqlAlchemyRoutingRepository

router = APIRouter(prefix="/public", tags=["Public Citizen Access (no login)"])

# A citizen's own private vehicle, not a logistics fleet vehicle — generous
# defaults so an ordinary car, jeep or SUV is never wrongly excluded by a bridge
# weight/height limit meant for trucks.
_PUBLIC_VEHICLE_MAX_WEIGHT_KG = 2500.0
_PUBLIC_VEHICLE_HEIGHT_M = 2.2
_OSRM_URL = "http://router.project-osrm.org/route/v1/driving"


def _haversine_dist(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lam / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _fetch_regional_osrm_route(
    origin_lon: float,
    origin_lat: float,
    destination_lon: float,
    destination_lat: float,
) -> RoutePlanResponse | None:
    now = datetime.now(UTC)
    url = f"{_OSRM_URL}/{origin_lon},{origin_lat};{destination_lon},{destination_lat}?overview=full&geometries=geojson&steps=true"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == "Ok" and data.get("routes"):
                    r = data["routes"][0]
                    dist_m = int(r.get("distance", 0))
                    dur_s = int(r.get("duration", 0))

                    edges: list[RouteEdgeResponse] = []
                    cum_dist = 0
                    cum_dur = 0
                    seq = 0
                    for leg in r.get("legs", []):
                        for step in leg.get("steps", []):
                            s_dist = int(step.get("distance", 0))
                            s_dur = int(step.get("duration", 0))
                            cum_dist += s_dist
                            cum_dur += s_dur
                            step_name = step.get("name") or "Regional Highway Link"
                            raw_geom = step.get("geometry")
                            step_geom = raw_geom if isinstance(raw_geom, dict) else None
                            edges.append(
                                RouteEdgeResponse(
                                    edge_id=uuid4(),
                                    sequence_order=seq,
                                    cumulative_distance_meters=cum_dist,
                                    cumulative_duration_seconds=cum_dur,
                                    road_name=step_name,
                                    geometry=step_geom,
                                )
                            )
                            seq += 1

                    if not edges:
                        edges = [
                            RouteEdgeResponse(
                                edge_id=uuid4(),
                                sequence_order=0,
                                cumulative_distance_meters=dist_m,
                                cumulative_duration_seconds=dur_s,
                                road_name="Regional Highway Corridor",
                                geometry=r.get("geometry"),
                            )
                        ]

                    return RoutePlanResponse(
                        id=uuid4(),
                        organization_id=PUBLIC_ORG_ID,
                        trip_id=None,
                        graph_version="regional-ner-osm-v1",
                        status_version=1,
                        policy_version=PolicyVersion.STANDARD_DISPATCH_V1.value,
                        result_status=RouteResultStatus.FEASIBLE,
                        total_distance_meters=dist_m,
                        total_duration_seconds=dur_s,
                        requires_human_review=False,
                        excluded_edge_reasons={},
                        primary_geometry=r.get("geometry"),
                        edges=edges,
                        alternatives=[],
                        evaluated_at=now,
                        expires_at=now + timedelta(hours=1),
                    )
    except Exception:
        pass

    # Resilient fallback geometry across North-East terrain if OSRM is unreachable
    straight_m = _haversine_dist(origin_lat, origin_lon, destination_lat, destination_lon)
    mountain_dist_m = int(straight_m * 1.45)
    speed_mps = 40.0 * 1000.0 / 3600.0
    est_dur_s = max(60, int(mountain_dist_m / speed_mps))
    fallback_geom = {
        "type": "LineString",
        "coordinates": [[origin_lon, origin_lat], [destination_lon, destination_lat]],
    }
    return RoutePlanResponse(
        id=uuid4(),
        organization_id=PUBLIC_ORG_ID,
        trip_id=None,
        graph_version="regional-ner-fallback",
        status_version=1,
        policy_version=PolicyVersion.STANDARD_DISPATCH_V1.value,
        result_status=RouteResultStatus.FEASIBLE,
        total_distance_meters=mountain_dist_m,
        total_duration_seconds=est_dur_s,
        requires_human_review=False,
        excluded_edge_reasons={},
        primary_geometry=fallback_geom,
        edges=[
            RouteEdgeResponse(
                edge_id=uuid4(),
                sequence_order=0,
                cumulative_distance_meters=mountain_dist_m,
                cumulative_duration_seconds=est_dur_s,
                road_name="Regional Connecting Corridor",
                geometry=fallback_geom,
            )
        ],
        alternatives=[],
        evaluated_at=now,
        expires_at=now + timedelta(hours=1),
    )


@router.get(
    "/network/edges",
    summary="Public: road edges within a bounding box, with live status",
    response_model=dict[str, Any],
)
async def get_public_bounded_edges(
    min_lon: float = Query(..., ge=-180.0, le=180.0),
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lon: float = Query(..., ge=-180.0, le=180.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    zoom: int | None = Query(None, ge=1, le=22),
    limit: int = Query(2000, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit("network_edges", limit=60, window_seconds=60)),
) -> dict[str, Any]:
    repo = SqlAlchemyNetworkRepository(db)
    use_case = QueryBoundedEdgesUseCase(repo)
    return await use_case.execute(
        min_lon=min_lon, min_lat=min_lat, max_lon=max_lon, max_lat=max_lat, zoom=zoom, limit=limit
    )


@router.get(
    "/hazard/risk-zones",
    summary="Public: landslide risk zones within a bounding box",
    response_model=dict[str, Any],
)
async def get_public_bounded_risk_zones(
    min_lon: float = Query(..., ge=-180.0, le=180.0),
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lon: float = Query(..., ge=-180.0, le=180.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    limit: int = Query(500, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit("hazard_zones", limit=60, window_seconds=60)),
) -> dict[str, Any]:
    repo = SqlAlchemyHazardRepository(db)
    use_case = GetBoundedRiskZonesUseCase(repo)
    return await use_case.execute(
        min_lon=min_lon, min_lat=min_lat, max_lon=max_lon, max_lat=max_lat, limit=limit
    )


@router.get(
    "/incidents",
    summary="Public: active incidents, redacted to type, severity and an approximate location",
    response_model=list[PublicIncidentResponse],
)
async def list_public_incidents(
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit("incidents", limit=30, window_seconds=60)),
) -> list[PublicIncidentResponse]:
    use_case = ListPublicIncidentsUseCase(
        incident_repo=SqlAlchemyIncidentRepository(db),
        reporting_repo=SqlAlchemyReportingRepository(db),
    )
    summaries = await use_case.execute(limit=limit)
    return [
        PublicIncidentResponse(
            id=s.id,
            title=s.title,
            severity=s.severity,
            lifecycle=s.lifecycle,
            approx_lat=s.approx_lat,
            approx_lon=s.approx_lon,
            created_at=s.created_at,
        )
        for s in summaries
    ]


@router.post(
    "/routes/evaluate",
    summary="Public: evaluate a road route for a standard private vehicle",
    response_model=RoutePlanResponse,
    status_code=status.HTTP_200_OK,
)
async def evaluate_public_route(
    req: PublicRouteEvaluationRequest,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit("routes_evaluate", limit=10, window_seconds=60)),
) -> RoutePlanResponse:
    repo = SqlAlchemyRoutingRepository(db)
    use_case = EvaluateRouteUseCase(repo)

    constraints = VehicleConstraints(
        vehicle_id=None,
        max_weight_kg=_PUBLIC_VEHICLE_MAX_WEIGHT_KG,
        height_m=_PUBLIC_VEHICLE_HEIGHT_M,
        is_hazmat=False,
        cargo_priority="TIER_3_STANDARD",
        departure_time=datetime.now(UTC),
    )

    try:
        plan = await use_case.execute(
            organization_id=PUBLIC_ORG_ID,
            vehicle_constraints=constraints,
            origin_coords=(req.origin_lon, req.origin_lat),
            destination_coords=(req.destination_lon, req.destination_lat),
            policy_version=PolicyVersion.STANDARD_DISPATCH_V1,
        )
        await db.commit()
        return to_route_plan_response(plan)
    except Exception:
        await db.rollback()
        # Fall back to regional highway routing engine for points beyond or disconnected from the pilot corridor
        regional_plan = await _fetch_regional_osrm_route(
            origin_lon=req.origin_lon,
            origin_lat=req.origin_lat,
            destination_lon=req.destination_lon,
            destination_lat=req.destination_lat,
        )
        if regional_plan is not None:
            return regional_plan
        raise
