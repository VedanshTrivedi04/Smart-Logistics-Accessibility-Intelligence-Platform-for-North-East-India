"""
app/modules/logistics/api/router.py — FastAPI Router for Logistics & Fleet Dispatch.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status

from app.core.db import DbSession, get_db_session
from app.core.security import require_authenticated
from app.modules.identity.public import Capability, PrincipalContext
from app.modules.logistics.api.schemas import (
    CommitmentCreateRequest,
    CommitmentResponse,
    DispatchTripRequest,
    DriverCreateRequest,
    DriverResponse,
    TripResponse,
    TripStopResponse,
    TripTransitionRequest,
    VehicleCreateRequest,
    VehicleResponse,
)
from app.modules.logistics.application.create_commitment import CreateCommitmentUseCase
from app.modules.logistics.application.create_driver import CreateDriverUseCase
from app.modules.logistics.application.create_vehicle import CreateVehicleUseCase
from app.modules.logistics.application.dispatch_trip import DispatchTripUseCase
from app.modules.logistics.application.update_trip_status import UpdateTripStatusUseCase
from app.modules.logistics.domain.entities import Trip
from app.modules.logistics.domain.enums import TripStatus
from app.modules.logistics.domain.exceptions import TripNotFoundError
from app.modules.logistics.infrastructure.repository import SqlAlchemyLogisticsRepository

router = APIRouter(prefix="/logistics", tags=["Logistics & Fleet"])


def _to_trip_response(t: Trip) -> TripResponse:
    return TripResponse(
        id=t.id,
        organization_id=t.organization_id,
        vehicle_id=t.vehicle_id,
        driver_id=t.driver_id,
        trip_code=t.trip_code,
        status=t.status,
        current_route_snapshot_id=t.current_route_snapshot_id,
        scheduled_departure=t.scheduled_departure,
        actual_departure=t.actual_departure,
        actual_arrival=t.actual_arrival,
        created_at=t.created_at,
        stops=[
            TripStopResponse(
                id=s.id,
                trip_id=s.trip_id,
                sequence_order=s.sequence_order,
                stop_type=s.stop_type,
                facility_id=s.facility_id,
                lat=s.lat,
                lon=s.lon,
                planned_arrival=s.planned_arrival,
                planned_departure=s.planned_departure,
                actual_arrival=s.actual_arrival,
                actual_departure=s.actual_departure,
                status=s.status,
            )
            for s in t.stops
        ],
        commitment_ids=t.commitment_ids,
    )


# ──────────────────────────────────────────────────────────────
# Vehicles
# ──────────────────────────────────────────────────────────────

@router.post("/vehicles", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
async def create_vehicle(
    payload: VehicleCreateRequest,
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> VehicleResponse:
    principal.enforce_capability(Capability.VIEW_FLEET)
    repo = SqlAlchemyLogisticsRepository(session)
    use_case = CreateVehicleUseCase(repo)
    vehicle = await use_case.execute(
        organization_id=principal.organization_id,
        registration_number=payload.registration_number,
        vehicle_type=payload.vehicle_type,
        make_model=payload.make_model,
        max_weight_kg=payload.max_weight_kg,
        empty_weight_kg=payload.empty_weight_kg,
        height_m=payload.height_m,
        width_m=payload.width_m,
        length_m=payload.length_m,
        axle_count=payload.axle_count,
        is_hazmat_capable=payload.is_hazmat_capable,
        is_refrigerated=payload.is_refrigerated,
    )
    return VehicleResponse(
        id=vehicle.id,
        organization_id=vehicle.organization_id,
        registration_number=vehicle.registration_number,
        vehicle_type=vehicle.vehicle_type,
        make_model=vehicle.make_model,
        max_weight_kg=vehicle.max_weight_kg,
        empty_weight_kg=vehicle.empty_weight_kg,
        height_m=vehicle.height_m,
        width_m=vehicle.width_m,
        length_m=vehicle.length_m,
        axle_count=vehicle.axle_count,
        is_hazmat_capable=vehicle.is_hazmat_capable,
        is_refrigerated=vehicle.is_refrigerated,
        is_active=vehicle.is_active,
        created_at=vehicle.created_at,
    )


@router.get("/vehicles", response_model=list[VehicleResponse])
async def list_vehicles(
    is_active: bool | None = Query(None),
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> list[VehicleResponse]:
    principal.enforce_capability(Capability.VIEW_FLEET)
    repo = SqlAlchemyLogisticsRepository(session)
    vehicles = await repo.list_vehicles(principal.organization_id, is_active=is_active)
    return [
        VehicleResponse(
            id=v.id,
            organization_id=v.organization_id,
            registration_number=v.registration_number,
            vehicle_type=v.vehicle_type,
            make_model=v.make_model,
            max_weight_kg=v.max_weight_kg,
            empty_weight_kg=v.empty_weight_kg,
            height_m=v.height_m,
            width_m=v.width_m,
            length_m=v.length_m,
            axle_count=v.axle_count,
            is_hazmat_capable=v.is_hazmat_capable,
            is_refrigerated=v.is_refrigerated,
            is_active=v.is_active,
            created_at=v.created_at,
        )
        for v in vehicles
    ]


# ──────────────────────────────────────────────────────────────
# Drivers
# ──────────────────────────────────────────────────────────────

@router.post("/drivers", response_model=DriverResponse, status_code=status.HTTP_201_CREATED)
async def create_driver(
    payload: DriverCreateRequest,
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> DriverResponse:
    principal.enforce_capability(Capability.VIEW_FLEET)
    repo = SqlAlchemyLogisticsRepository(session)
    use_case = CreateDriverUseCase(repo)
    driver = await use_case.execute(
        organization_id=principal.organization_id,
        full_name=payload.full_name,
        phone_e164=payload.phone_e164,
        license_number=payload.license_number,
        license_classes=payload.license_classes,
        user_id=payload.user_id,
    )
    can_view_pii = principal.has_capability(Capability.VIEW_DRIVER_PII)
    return DriverResponse.from_entity(driver, can_view_pii=can_view_pii)


@router.get("/drivers", response_model=list[DriverResponse])
async def list_drivers(
    is_active: bool | None = Query(None),
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> list[DriverResponse]:
    principal.enforce_capability(Capability.VIEW_FLEET)
    repo = SqlAlchemyLogisticsRepository(session)
    drivers = await repo.list_drivers(principal.organization_id, is_active=is_active)
    can_view_pii = principal.has_capability(Capability.VIEW_DRIVER_PII)
    return [DriverResponse.from_entity(d, can_view_pii=can_view_pii) for d in drivers]


# ──────────────────────────────────────────────────────────────
# Commitments
# ──────────────────────────────────────────────────────────────

@router.post("/commitments", response_model=CommitmentResponse, status_code=status.HTTP_201_CREATED)
async def create_commitment(
    payload: CommitmentCreateRequest,
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> CommitmentResponse:
    principal.enforce_capability(Capability.DISPATCH_ROUTE)
    repo = SqlAlchemyLogisticsRepository(session)
    use_case = CreateCommitmentUseCase(repo)
    comm = await use_case.execute(
        organization_id=principal.organization_id,
        consignment_reference=payload.consignment_reference,
        cargo_category=payload.cargo_category,
        priority_tier=payload.priority_tier,
        consigned_weight_kg=payload.consigned_weight_kg,
        consigned_quantity_units=payload.consigned_quantity_units,
        origin_facility_id=payload.origin_facility_id,
        destination_facility_id=payload.destination_facility_id,
        required_before=payload.required_before,
        consigned_volume_m3=payload.consigned_volume_m3,
    )
    return CommitmentResponse.from_entity(comm)


@router.get("/commitments", response_model=list[CommitmentResponse])
async def list_commitments(
    status_filter: str | None = Query(None, alias="status"),
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> list[CommitmentResponse]:
    principal.enforce_capability(Capability.VIEW_FLEET)
    repo = SqlAlchemyLogisticsRepository(session)
    comms = await repo.list_commitments(principal.organization_id, status=status_filter)
    return [CommitmentResponse.from_entity(c) for c in comms]


# ──────────────────────────────────────────────────────────────
# Trips
# ──────────────────────────────────────────────────────────────

@router.post("/trips", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def dispatch_trip(
    payload: DispatchTripRequest,
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> TripResponse:
    principal.enforce_capability(Capability.DISPATCH_ROUTE)
    repo = SqlAlchemyLogisticsRepository(session)
    use_case = DispatchTripUseCase(repo)
    trip = await use_case.execute(
        organization_id=principal.organization_id,
        vehicle_id=payload.vehicle_id,
        driver_id=payload.driver_id,
        trip_code=payload.trip_code,
        scheduled_departure=payload.scheduled_departure,
        stops_data=[s.model_dump() for s in payload.stops],
        commitment_ids=payload.commitment_ids,
        current_route_snapshot_id=payload.current_route_snapshot_id,
    )
    return _to_trip_response(trip)


@router.get("/trips", response_model=list[TripResponse])
async def list_trips(
    status_filter: TripStatus | None = Query(None, alias="status"),
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> list[TripResponse]:
    principal.enforce_capability(Capability.VIEW_FLEET)
    repo = SqlAlchemyLogisticsRepository(session)
    trips = await repo.list_trips(principal.organization_id, status=status_filter)
    return [_to_trip_response(t) for t in trips]


@router.get("/trips/{trip_id}", response_model=TripResponse)
async def get_trip(
    trip_id: UUID,
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> TripResponse:
    principal.enforce_capability(Capability.VIEW_FLEET)
    repo = SqlAlchemyLogisticsRepository(session)
    trip = await repo.get_trip_by_id(trip_id)
    if trip is None or trip.organization_id != principal.organization_id:
        raise TripNotFoundError(f"Trip '{trip_id}' not found")
    return _to_trip_response(trip)


@router.post("/trips/{trip_id}/transition", response_model=TripResponse)
async def transition_trip(
    trip_id: UUID,
    payload: TripTransitionRequest,
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> TripResponse:
    principal.enforce_capability(Capability.DISPATCH_ROUTE)
    repo = SqlAlchemyLogisticsRepository(session)
    use_case = UpdateTripStatusUseCase(repo)
    trip = await use_case.execute(trip_id, payload.target_status)
    return _to_trip_response(trip)
