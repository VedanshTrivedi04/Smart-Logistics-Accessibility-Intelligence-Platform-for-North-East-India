"""
app/modules/impact/api/router.py — FastAPI Router for Disruption Impact Assessment.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.db import DbSession, get_db_session
from app.core.security import PrincipalContext, require_authenticated, require_capability
from app.modules.identity.domain.enums import Capability
from app.modules.impact.api.schemas import (
    EvaluateImpactRequest,
    EvaluateImpactSummaryResponse,
    FacilityImpactResponse,
    TripImpactResponse,
)
from app.modules.impact.application.evaluate_disruption_impact import EvaluateDisruptionImpactUseCase
from app.modules.impact.domain.entities import FacilityImpact, TripImpact
from app.modules.impact.infrastructure.repository import SqlAlchemyImpactRepository

router = APIRouter(prefix="", tags=["Disruption Impact"])


def _to_trip_impact_response(t: TripImpact) -> TripImpactResponse:
    return TripImpactResponse(
        id=t.id,
        trip_id=t.trip_id,
        incident_id=t.incident_id,
        edge_id=t.edge_id,
        source_event_id=t.source_event_id,
        source_status_version=t.source_status_version,
        assessment_version=t.assessment_version,
        impact_type=t.impact_type,
        severity=t.severity,
        delay_estimated_seconds=t.delay_estimated_seconds,
        distance_to_disruption_meters=t.distance_to_disruption_meters,
        recommended_action=t.recommended_action,
        is_active=t.is_active,
        resolved_reason=t.resolved_reason,
        assessed_at=t.assessed_at,
    )


def _to_facility_impact_response(f: FacilityImpact) -> FacilityImpactResponse:
    return FacilityImpactResponse(
        id=f.id,
        facility_id=f.facility_id,
        incident_id=f.incident_id,
        edge_id=f.edge_id,
        source_status_version=f.source_status_version,
        reachability_state=f.reachability_state,
        isolated=f.isolated,
        alternate_route_available=f.alternate_route_available,
        access_delay_seconds=f.access_delay_seconds,
        assessed_at=f.assessed_at,
    )


@router.get(
    "/trips/{trip_id}/impacts",
    response_model=list[TripImpactResponse],
    status_code=status.HTTP_200_OK,
)
async def get_trip_impacts(
    trip_id: UUID,
    active_only: bool = True,
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> list[TripImpactResponse]:
    """Lists disruption impacts assessed for a specific trip."""
    repo = SqlAlchemyImpactRepository(session)
    impacts = await repo.list_trip_impacts(trip_id=trip_id, active_only=active_only)
    return [_to_trip_impact_response(i) for i in impacts]


@router.get(
    "/facilities/{facility_id}/impacts",
    response_model=list[FacilityImpactResponse],
    status_code=status.HTTP_200_OK,
)
async def get_facility_impacts(
    facility_id: UUID,
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> list[FacilityImpactResponse]:
    """Lists reachability and isolation impacts for a facility."""
    repo = SqlAlchemyImpactRepository(session)
    impacts = await repo.list_facility_impacts(facility_id=facility_id)
    return [_to_facility_impact_response(i) for i in impacts]


@router.post(
    "/impact/evaluate",
    response_model=EvaluateImpactSummaryResponse,
    status_code=status.HTTP_200_OK,
)
async def evaluate_disruption_impact(
    payload: EvaluateImpactRequest,
    # Writes impact records, so it needs more than a login (a field officer or driver must not trigger it).
    principal: PrincipalContext = Depends(require_capability(Capability.COORDINATE_RESPONSE)),
    session: DbSession = Depends(get_db_session),
) -> EvaluateImpactSummaryResponse:
    """
    Manually triggers disruption impact evaluation for an edge.
    Evaluates affected trips, SLA delivery commitments, and facility isolation.
    """
    repo = SqlAlchemyImpactRepository(session)
    use_case = EvaluateDisruptionImpactUseCase(repo)

    result = await use_case.execute(
        edge_id=payload.edge_id,
        source_status_version=payload.source_status_version,
        source_event_id=payload.source_event_id,
        incident_id=payload.incident_id,
        impact_type=payload.impact_type,
        severity=payload.severity,
        delay_estimated_seconds=payload.delay_estimated_seconds,
    )

    # Handlers own the transaction: get_db() does not commit, so without this the write is rolled back.
    await session.commit()
    return EvaluateImpactSummaryResponse(
        edge_id=result["edge_id"],
        trips_evaluated=result["trips_evaluated"],
        trips_impacted=result["trips_impacted"],
        commitments_impacted=result["commitments_impacted"],
        facilities_impacted=result["facilities_impacted"],
    )
