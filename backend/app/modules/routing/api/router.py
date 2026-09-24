"""
app/modules/routing/api/router.py — FastAPI Router for Routing & Dispatch Decisions.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.db import DbSession, get_db_session
from app.core.security import PrincipalContext, require_authenticated, require_capability
from app.modules.identity.domain.enums import Capability
from app.modules.routing.api.schemas import (
    AlternativeRouteResponse,
    DispatchDecisionRequest,
    DispatchDecisionResponse,
    RouteEdgeResponse,
    RouteEvaluationRequest,
    RoutePlanResponse,
)
from app.modules.routing.application.evaluate_route import EvaluateRouteUseCase
from app.modules.routing.application.record_dispatch_decision import RecordDispatchDecisionUseCase
from app.modules.routing.domain.entities import RoutePlan, VehicleConstraints
from app.modules.routing.domain.exceptions import RoutePlanNotFoundError
from app.modules.routing.infrastructure.repository import SqlAlchemyRoutingRepository

router = APIRouter(prefix="", tags=["Routing & Dispatch"])


def to_route_plan_response(plan: RoutePlan) -> RoutePlanResponse:
    return RoutePlanResponse(
        id=plan.id,
        organization_id=plan.organization_id,
        trip_id=plan.trip_id,
        graph_version=plan.graph_version,
        status_version=plan.status_version,
        policy_version=plan.policy_version.value,
        result_status=plan.result_status,
        total_distance_meters=plan.total_distance_meters,
        total_duration_seconds=plan.total_duration_seconds,
        requires_human_review=plan.requires_human_review,
        excluded_edge_reasons=plan.excluded_edge_reasons,
        primary_geometry=plan.primary_geometry,
        edges=[
            RouteEdgeResponse(
                edge_id=e.edge_id,
                sequence_order=e.sequence_order,
                cumulative_distance_meters=e.cumulative_distance_meters,
                cumulative_duration_seconds=e.cumulative_duration_seconds,
                road_name=e.road_name,
                geometry=e.geometry,
            )
            for e in plan.edges
        ],
        alternatives=[
            AlternativeRouteResponse(
                rank=alt.rank,
                total_distance_meters=alt.total_distance_meters,
                total_duration_seconds=alt.total_duration_seconds,
                geometry=alt.geometry_geojson,
                edges=[
                    RouteEdgeResponse(
                        edge_id=ae.edge_id,
                        sequence_order=ae.sequence_order,
                        cumulative_distance_meters=ae.cumulative_distance_meters,
                        cumulative_duration_seconds=ae.cumulative_duration_seconds,
                        road_name=ae.road_name,
                        geometry=ae.geometry,
                    )
                    for ae in alt.edges
                ],
            )
            for alt in plan.alternatives
        ],
        evaluated_at=plan.evaluated_at,
        expires_at=plan.expires_at,
    )


@router.post(
    "/routes/evaluate",
    response_model=RoutePlanResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_capability(Capability.COMPUTE_ROUTE))],
)
async def evaluate_route(
    req: RouteEvaluationRequest,
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> RoutePlanResponse:
    repo = SqlAlchemyRoutingRepository(session)
    use_case = EvaluateRouteUseCase(repo)

    origin_coords = (req.origin_lon, req.origin_lat) if req.origin_lon is not None and req.origin_lat is not None else None
    dest_coords = (req.destination_lon, req.destination_lat) if req.destination_lon is not None and req.destination_lat is not None else None

    departure = req.departure_time or datetime.now(timezone.utc)

    constraints = VehicleConstraints(
        vehicle_id=req.vehicle_id,
        max_weight_kg=req.max_weight_kg,
        height_m=req.height_m,
        is_hazmat=req.is_hazmat,
        cargo_priority=req.cargo_priority,
        departure_time=departure,
    )

    plan = await use_case.execute(
        organization_id=principal.org_id,
        vehicle_constraints=constraints,
        trip_id=req.trip_id,
        origin_node_id=req.origin_node_id,
        origin_coords=origin_coords,
        destination_node_id=req.destination_node_id,
        destination_coords=dest_coords,
        policy_version=req.policy_version,
    )
    await session.commit()
    return to_route_plan_response(plan)


@router.get(
    "/routes/{route_plan_id}",
    response_model=RoutePlanResponse,
    dependencies=[Depends(require_capability(Capability.COMPUTE_ROUTE))],
)
async def get_route_plan(
    route_plan_id: UUID,
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> RoutePlanResponse:
    repo = SqlAlchemyRoutingRepository(session)
    plan = await repo.get_route_plan_by_id(route_plan_id)
    if not plan:
        raise RoutePlanNotFoundError(f"Route plan '{route_plan_id}' not found")
    return to_route_plan_response(plan)


@router.post(
    "/trips/{trip_id}/dispatch-decisions",
    response_model=DispatchDecisionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability(Capability.DISPATCH_ROUTE))],
)
async def record_dispatch_decision(
    trip_id: UUID,
    req: DispatchDecisionRequest,
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> DispatchDecisionResponse:
    repo = SqlAlchemyRoutingRepository(session)
    use_case = RecordDispatchDecisionUseCase(repo)

    decision = await use_case.execute(
        trip_id=trip_id,
        route_plan_id=req.route_plan_id,
        actor_id=principal.user_id,
        action=req.action,
        reason=req.reason,
        selected_alternative_rank=req.selected_alternative_rank,
    )
    await session.commit()

    return DispatchDecisionResponse(
        id=decision.id,
        trip_id=decision.trip_id,
        route_plan_id=decision.route_plan_id,
        action=decision.action.value,
        selected_alternative_rank=decision.selected_alternative_rank,
        reason=decision.reason,
        status_version_at_decision=decision.status_version_at_decision,
        decided_at=decision.decided_at,
    )
