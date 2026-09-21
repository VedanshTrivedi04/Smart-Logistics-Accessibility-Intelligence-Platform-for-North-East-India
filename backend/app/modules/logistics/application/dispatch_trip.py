"""
app/modules/logistics/application/dispatch_trip.py — Dispatch a trip use case with conflict and capacity checks.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.modules.logistics.application.ports import LogisticsRepositoryPort
from app.modules.logistics.domain.entities import Trip, TripStop
from app.modules.logistics.domain.enums import (
    CargoCategory,
    StopStatus,
    StopType,
    TripStatus,
)
from app.modules.logistics.domain.exceptions import (
    CommitmentNotFoundError,
    DriverNotFoundError,
    ResourceAlreadyDispatchedError,
    VehicleCapacityExceededError,
    VehicleHazmatIncapableError,
    VehicleNotFoundError,
)


class DispatchTripUseCase:
    def __init__(self, repository: LogisticsRepositoryPort):
        self.repository = repository

    async def execute(
        self,
        organization_id: UUID,
        vehicle_id: UUID,
        driver_id: UUID,
        trip_code: str,
        scheduled_departure: datetime,
        stops_data: list[dict],
        commitment_ids: list[UUID],
        current_route_snapshot_id: UUID | None = None,
    ) -> Trip:
        # 1. Row-level locked check for vehicle
        vehicle = await self.repository.get_vehicle_by_id(vehicle_id, for_update=True)
        if vehicle is None or not vehicle.is_active:
            raise VehicleNotFoundError(f"Active vehicle '{vehicle_id}' not found")

        # 2. Row-level locked check for driver
        driver = await self.repository.get_driver_by_id(driver_id, for_update=True)
        if driver is None or not driver.is_active:
            raise DriverNotFoundError(f"Active driver '{driver_id}' not found")

        # 3. Double assignment conflict checks
        if await self.repository.is_vehicle_dispatched(vehicle_id):
            raise ResourceAlreadyDispatchedError(f"Vehicle '{vehicle.registration_number}' is already on an active trip")
        if await self.repository.is_driver_dispatched(driver_id):
            raise ResourceAlreadyDispatchedError(f"Driver '{driver.full_name}' is already on an active trip")

        # 4. Commitments validation & capacity check
        total_weight = 0.0
        has_hazmat = False
        has_cold_chain = False

        for cid in commitment_ids:
            comm = await self.repository.get_commitment_by_id(cid)
            if comm is None:
                raise CommitmentNotFoundError(f"Commitment '{cid}' not found")
            total_weight += comm.consigned_weight_kg
            if comm.cargo_category == CargoCategory.OXYGEN_CYLINDERS:
                has_hazmat = True
            elif comm.cargo_category == CargoCategory.COLD_CHAIN_VACCINES:
                has_cold_chain = True

        if total_weight > vehicle.max_weight_kg:
            raise VehicleCapacityExceededError(
                f"Consignment total weight {total_weight} kg exceeds vehicle max capacity {vehicle.max_weight_kg} kg"
            )

        if has_hazmat and not vehicle.is_hazmat_capable:
            raise VehicleHazmatIncapableError("Consignment includes hazmat cargo, but vehicle is not hazmat-certified")

        if has_cold_chain and not vehicle.is_refrigerated:
            raise VehicleHazmatIncapableError("Consignment includes cold-chain cargo, but vehicle is not refrigerated")

        # 5. Build Trip and Stops
        now = datetime.now(timezone.utc)
        trip_id = uuid4()
        stops: list[TripStop] = []

        for idx, s in enumerate(stops_data):
            stops.append(
                TripStop(
                    id=uuid4(),
                    trip_id=trip_id,
                    sequence_order=idx + 1,
                    stop_type=StopType(s["stop_type"]),
                    facility_id=s.get("facility_id"),
                    lat=float(s["lat"]),
                    lon=float(s["lon"]),
                    planned_arrival=s["planned_arrival"],
                    planned_departure=s["planned_departure"],
                    actual_arrival=None,
                    actual_departure=None,
                    status=StopStatus.PENDING,
                )
            )

        trip = Trip(
            id=trip_id,
            organization_id=organization_id,
            vehicle_id=vehicle_id,
            driver_id=driver_id,
            trip_code=trip_code.strip().upper(),
            status=TripStatus.DISPATCHED,
            current_route_snapshot_id=current_route_snapshot_id,
            scheduled_departure=scheduled_departure,
            actual_departure=None,
            actual_arrival=None,
            created_at=now,
            updated_at=now,
            stops=stops,
            commitment_ids=commitment_ids,
        )

        return await self.repository.save_trip(trip)
