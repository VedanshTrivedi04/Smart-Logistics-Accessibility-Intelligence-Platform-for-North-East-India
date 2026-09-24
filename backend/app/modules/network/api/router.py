"""
app/modules/network/api/router.py — FastAPI Router for GIS, Network & Reachability Endpoints.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from app.core.db import DbSession as AsyncSession, get_db
from app.core.security import (
    require_authenticated,
    require_capability,
)
from app.modules.identity.domain.enums import Capability
from app.modules.identity.domain.principal import PrincipalContext
from app.modules.network.api.schemas import (
    DeclareEdgeStatusRequest,
    EdgeDetailResponse,
    FacilityResponse,
    NetworkVersionResponse,
    ReachabilityResponse,
)
from app.modules.network.application.declare_edge_status import DeclareEdgeStatusUseCase
from app.modules.network.application.evaluate_reachability import (
    EvaluateFacilityReachabilityUseCase,
)
from app.modules.network.application.get_edge_status import GetEdgeStatusUseCase
from app.modules.network.application.query_network import QueryBoundedEdgesUseCase
from app.modules.network.domain.enums import FacilityKind, SourceEventType
from app.modules.network.domain.exceptions import EdgeNotFoundError, FacilityNotFoundError
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository

router = APIRouter(tags=["Road Network & Spatial Intelligence"])


# ─────────────────────────────────────────────────────────────────
# 1. Bounded Spatial Edges (GeoJSON Map Viewport)
# ─────────────────────────────────────────────────────────────────
@router.get(
    "/network/edges",
    summary="Get road edges within geographic bounding box",
    response_model=dict[str, Any],
)
async def get_bounded_edges(
    min_lon: float = Query(..., ge=-180.0, le=180.0, description="Minimum longitude"),
    min_lat: float = Query(..., ge=-90.0, le=90.0, description="Minimum latitude"),
    max_lon: float = Query(..., ge=-180.0, le=180.0, description="Maximum longitude"),
    max_lat: float = Query(..., ge=-90.0, le=90.0, description="Maximum latitude"),
    zoom: int | None = Query(None, ge=1, le=22, description="Map zoom level for simplification"),
    limit: int = Query(5000, ge=1, le=5000, description="Maximum features to return"),
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> dict[str, Any]:
    repo = SqlAlchemyNetworkRepository(db)
    use_case = QueryBoundedEdgesUseCase(repo)
    return await use_case.execute(
        min_lon=min_lon,
        min_lat=min_lat,
        max_lon=max_lon,
        max_lat=max_lat,
        zoom=zoom,
        limit=limit,
    )


# ─────────────────────────────────────────────────────────────────
# 2. Single Road Edge Detail
# ─────────────────────────────────────────────────────────────────
@router.get(
    "/network/edges/{edge_id}",
    summary="Get single road edge profile and live status",
    response_model=EdgeDetailResponse,
)
async def get_edge_detail(
    edge_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> EdgeDetailResponse:
    repo = SqlAlchemyNetworkRepository(db)
    edge = await repo.get_edge_by_id(edge_id)
    if not edge:
        raise EdgeNotFoundError(f"Edge {edge_id} not found")

    status_uc = GetEdgeStatusUseCase(repo)
    curr_status = await status_uc.execute(edge_id)
    restrictions = await repo.get_edge_restrictions(edge_id)

    return EdgeDetailResponse(
        id=edge.id,
        edge_index=edge.edge_index,
        road_class=edge.road_class.value,
        road_name=edge.road_name,
        surface_type=edge.surface_type.value,
        speed_limit_kmh=edge.speed_limit_kmh,
        length_meters=edge.length_meters,
        base_seconds=edge.base_seconds,
        is_one_way=edge.is_one_way,
        is_bridge=edge.is_bridge,
        status=curr_status.status.value,
        freshness=curr_status.freshness.value,
        status_version=curr_status.status_version,
        restrictions=[
            {
                "kind": r.kind.value,
                "value_numeric": r.value_numeric,
                "unit": r.unit,
                "direction": r.direction,
            }
            for r in restrictions
        ],
        coordinates=edge.coordinates,
    )


# ─────────────────────────────────────────────────────────────────
# 3. Declare Edge Status (Road Block / Caution Decision)
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/network/edges/{edge_id}/status",
    summary="Declare road accessibility status (authorized verifiers / authorities only)",
    status_code=status.HTTP_200_OK,
)
async def declare_edge_status(
    edge_id: UUID,
    body: DeclareEdgeStatusRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.UPDATE_ROAD_STATUS)),
) -> dict[str, Any]:
    repo = SqlAlchemyNetworkRepository(db)
    use_case = DeclareEdgeStatusUseCase(edge_status_repo=repo, network_repo=repo)

    result = await use_case.execute(
        edge_id=edge_id,
        status=body.status,
        reason=body.reason,
        source_event_type=SourceEventType.OFFICIAL_DECISION,
        actor_user_id=principal.user_id,
        restrictions=body.restrictions,
        valid_until=body.valid_until,
    )

    await db.commit()

    return {
        "edge_id": str(result.edge_id),
        "status": result.status.value,
        "freshness": result.freshness.value,
        "status_version": result.status_version,
        "last_verified_at": result.last_verified_at.isoformat() if result.last_verified_at else None,
        "expires_at": result.expires_at.isoformat() if result.expires_at else None,
    }


# ─────────────────────────────────────────────────────────────────
# 4. Enrolled Critical Facilities List & Detail
# ─────────────────────────────────────────────────────────────────
@router.get(
    "/facilities",
    summary="List enrolled critical facilities (hospitals, oxygen plants, hubs)",
    response_model=list[FacilityResponse],
)
async def list_facilities(
    jurisdiction_id: UUID | None = Query(None, description="Filter by jurisdiction"),
    kind: FacilityKind | None = Query(None, description="Filter by facility kind"),
    is_critical: bool | None = Query(None, description="Filter by critical status"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> list[FacilityResponse]:
    repo = SqlAlchemyNetworkRepository(db)
    facilities = await repo.get_facilities(
        jurisdiction_id=jurisdiction_id,
        kind=kind,
        is_critical=is_critical,
        limit=limit,
    )
    return [
        FacilityResponse(
            id=f.id,
            code=f.code,
            name=f.name,
            kind=f.kind,
            jurisdiction_id=f.jurisdiction_id,
            lon=f.lon,
            lat=f.lat,
            is_critical=f.is_critical,
            is_active=f.is_active,
            nearest_road_node_id=f.nearest_road_node_id,
            snap_distance_m=f.snap_distance_m,
        )
        for f in facilities
    ]


@router.get(
    "/facilities/{facility_id}",
    summary="Get single facility profile",
    response_model=FacilityResponse,
)
async def get_facility(
    facility_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> FacilityResponse:
    repo = SqlAlchemyNetworkRepository(db)
    facility = await repo.get_facility_by_id(facility_id)
    if not facility:
        raise FacilityNotFoundError(f"Facility {facility_id} not found")

    return FacilityResponse(
        id=facility.id,
        code=facility.code,
        name=facility.name,
        kind=facility.kind,
        jurisdiction_id=facility.jurisdiction_id,
        lon=facility.lon,
        lat=facility.lat,
        is_critical=facility.is_critical,
        is_active=facility.is_active,
        nearest_road_node_id=facility.nearest_road_node_id,
        snap_distance_m=facility.snap_distance_m,
    )


# ─────────────────────────────────────────────────────────────────
# 5. Facility Reachability Analysis
# ─────────────────────────────────────────────────────────────────
@router.get(
    "/facilities/{facility_id}/reachability",
    summary="Evaluate emergency supply reachability to an enrolled facility",
    response_model=ReachabilityResponse,
)
async def evaluate_reachability(
    facility_id: UUID,
    required_weight_tonnes: float = Query(16.0, ge=1.0, le=60.0, description="Minimum cargo/vehicle weight required"),
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> ReachabilityResponse:
    repo = SqlAlchemyNetworkRepository(db)
    use_case = EvaluateFacilityReachabilityUseCase(network_repo=repo, edge_status_repo=repo)
    result = await use_case.execute(facility_id=facility_id, required_weight_tonnes=required_weight_tonnes)
    return ReachabilityResponse(**result)


# ─────────────────────────────────────────────────────────────────
# 6. Network Versions
# ─────────────────────────────────────────────────────────────────
@router.get(
    "/network/versions",
    summary="Get active road network graph version metadata",
    response_model=NetworkVersionResponse | None,
)
async def get_active_network_version(
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> NetworkVersionResponse | None:
    repo = SqlAlchemyNetworkRepository(db)
    ver = await repo.get_active_version()
    if not ver:
        return None
    return NetworkVersionResponse(
        id=ver.id,
        code=ver.code,
        name=ver.name,
        status=ver.status,
        built_at=ver.built_at,
        metadata=ver.metadata,
    )


# ─────────────────────────────────────────────────────────────────
# 7. Seed Regional Network & Correct Geometries (Maintenance)
# ─────────────────────────────────────────────────────────────────
@router.get(
    "/network/seed-regional-network",
    summary="Correct road geometry glitches and expand network across all 8 NER states",
    status_code=status.HTTP_200_OK,
)
@router.post(
    "/network/seed-regional-network",
    summary="Correct road geometry glitches and expand network across all 8 NER states",
    status_code=status.HTTP_200_OK,
)
async def seed_regional_highway_network(
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> dict[str, Any]:
    import traceback
    try:
        from app.modules.network.application.seed_regional_network import seed_regional_network
        result = await seed_regional_network(db)
        return {"status": "ok", "detail": "Regional highway network expanded and geometries corrected", **result}
    except Exception as exc:
        return {"status": "error", "error": str(exc), "trace": traceback.format_exc()}

