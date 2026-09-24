"""
app/modules/logistics/infrastructure/repository.py — PostGIS & SQLAlchemy Repository for Logistics.
"""

from __future__ import annotations

from typing import cast
from uuid import UUID

from geoalchemy2.functions import ST_GeomFromText, ST_X, ST_Y
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.logistics.application.ports import LogisticsRepositoryPort
from app.modules.logistics.domain.entities import (
    DeliveryCommitment,
    Driver,
    Trip,
    TripStop,
    Vehicle,
)
from app.modules.logistics.domain.enums import (
    CargoCategory,
    DeliveryStatus,
    PriorityTier,
    StopStatus,
    StopType,
    TripStatus,
    VehicleType,
)
from app.modules.logistics.infrastructure.models import (
    DeliveryCommitmentModel,
    DriverModel,
    TripCommitmentModel,
    TripModel,
    TripStopModel,
    VehicleModel,
)


class SqlAlchemyLogisticsRepository(LogisticsRepositoryPort):
    def __init__(self, session: AsyncSession):
        self.session = session

    # ──────────────────────────────────────────────────────────
    # Vehicles
    # ──────────────────────────────────────────────────────────

    async def get_vehicle_by_id(self, vehicle_id: UUID, for_update: bool = False) -> Vehicle | None:
        stmt = sa.select(VehicleModel).where(VehicleModel.id == vehicle_id)
        if for_update:
            stmt = stmt.with_for_update()
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_vehicle_entity(model) if model else None

    async def get_vehicle_by_registration(self, organization_id: UUID, reg_num: str) -> Vehicle | None:
        stmt = sa.select(VehicleModel).where(
            VehicleModel.organization_id == organization_id,
            VehicleModel.registration_number == reg_num,
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_vehicle_entity(model) if model else None

    async def save_vehicle(self, vehicle: Vehicle) -> Vehicle:
        model = VehicleModel(
            id=vehicle.id,
            organization_id=vehicle.organization_id,
            registration_number=vehicle.registration_number,
            vehicle_type=vehicle.vehicle_type.value,
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
            updated_at=vehicle.updated_at,
        )
        self.session.add(model)
        await self.session.flush()
        return self._to_vehicle_entity(model)

    async def list_vehicles(self, organization_id: UUID | None = None, is_active: bool | None = None) -> list[Vehicle]:
        stmt = sa.select(VehicleModel)
        if organization_id is not None:
            stmt = stmt.where(VehicleModel.organization_id == organization_id)
        if is_active is not None:
            stmt = stmt.where(VehicleModel.is_active == is_active)
        stmt = stmt.order_by(VehicleModel.registration_number)
        result = await self.session.execute(stmt)
        return [self._to_vehicle_entity(m) for m in result.scalars()]

    # ──────────────────────────────────────────────────────────
    # Drivers
    # ──────────────────────────────────────────────────────────

    async def get_driver_by_id(self, driver_id: UUID, for_update: bool = False) -> Driver | None:
        stmt = sa.select(DriverModel).where(DriverModel.id == driver_id)
        if for_update:
            stmt = stmt.with_for_update()
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_driver_entity(model) if model else None

    async def save_driver(self, driver: Driver) -> Driver:
        model = DriverModel(
            id=driver.id,
            organization_id=driver.organization_id,
            user_id=driver.user_id,
            full_name=driver.full_name,
            phone_e164=driver.phone_e164,
            license_number=driver.license_number,
            license_classes=driver.license_classes,
            is_active=driver.is_active,
            created_at=driver.created_at,
            updated_at=driver.updated_at,
        )
        self.session.add(model)
        await self.session.flush()
        return self._to_driver_entity(model)

    async def list_drivers(self, organization_id: UUID, is_active: bool | None = None) -> list[Driver]:
        stmt = sa.select(DriverModel).where(DriverModel.organization_id == organization_id)
        if is_active is not None:
            stmt = stmt.where(DriverModel.is_active == is_active)
        stmt = stmt.order_by(DriverModel.full_name)
        result = await self.session.execute(stmt)
        return [self._to_driver_entity(m) for m in result.scalars()]

    # ──────────────────────────────────────────────────────────
    # Delivery Commitments
    # ──────────────────────────────────────────────────────────

    async def get_commitment_by_id(self, commitment_id: UUID) -> DeliveryCommitment | None:
        stmt = sa.select(DeliveryCommitmentModel).where(DeliveryCommitmentModel.id == commitment_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_commitment_entity(model) if model else None

    async def save_commitment(self, commitment: DeliveryCommitment) -> DeliveryCommitment:
        model = DeliveryCommitmentModel(
            id=commitment.id,
            organization_id=commitment.organization_id,
            consignment_reference=commitment.consignment_reference,
            cargo_category=commitment.cargo_category.value,
            priority_tier=commitment.priority_tier.value,
            consigned_weight_kg=commitment.consigned_weight_kg,
            consigned_volume_m3=commitment.consigned_volume_m3,
            consigned_quantity_units=commitment.consigned_quantity_units,
            delivered_quantity_units=commitment.delivered_quantity_units,
            origin_facility_id=commitment.origin_facility_id,
            destination_facility_id=commitment.destination_facility_id,
            required_before=commitment.required_before,
            status=commitment.status.value,
            shortage_reason=commitment.shortage_reason,
            created_at=commitment.created_at,
            updated_at=commitment.updated_at,
        )
        self.session.add(model)
        await self.session.flush()
        return self._to_commitment_entity(model)

    async def list_commitments(self, organization_id: UUID, status: str | None = None) -> list[DeliveryCommitment]:
        stmt = sa.select(DeliveryCommitmentModel).where(DeliveryCommitmentModel.organization_id == organization_id)
        if status:
            stmt = stmt.where(DeliveryCommitmentModel.status == status)
        stmt = stmt.order_by(DeliveryCommitmentModel.required_before)
        result = await self.session.execute(stmt)
        return [self._to_commitment_entity(m) for m in result.scalars()]

    # ──────────────────────────────────────────────────────────
    # Trips & Conflict Checks
    # ──────────────────────────────────────────────────────────

    async def is_vehicle_dispatched(self, vehicle_id: UUID) -> bool:
        stmt = sa.select(sa.func.count()).select_from(TripModel).where(
            TripModel.vehicle_id == vehicle_id,
            TripModel.status.in_(["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION"]),
        )
        result = await self.session.execute(stmt)
        return cast(int, result.scalar_one()) > 0

    async def is_driver_dispatched(self, driver_id: UUID) -> bool:
        stmt = sa.select(sa.func.count()).select_from(TripModel).where(
            TripModel.driver_id == driver_id,
            TripModel.status.in_(["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION"]),
        )
        result = await self.session.execute(stmt)
        return cast(int, result.scalar_one()) > 0

    async def get_trip_by_id(self, trip_id: UUID, for_update: bool = False) -> Trip | None:
        stmt = sa.select(TripModel).where(TripModel.id == trip_id).options(
            selectinload(TripModel.stops),
            selectinload(TripModel.commitments),
        )
        if for_update:
            stmt = stmt.with_for_update()
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return await self._to_trip_entity(model) if model else None

    async def save_trip(self, trip: Trip) -> Trip:
        trip_model = TripModel(
            id=trip.id,
            organization_id=trip.organization_id,
            vehicle_id=trip.vehicle_id,
            driver_id=trip.driver_id,
            trip_code=trip.trip_code,
            status=trip.status.value,
            current_route_snapshot_id=trip.current_route_snapshot_id,
            scheduled_departure=trip.scheduled_departure,
            actual_departure=trip.actual_departure,
            actual_arrival=trip.actual_arrival,
            created_at=trip.created_at,
            updated_at=trip.updated_at,
        )
        self.session.add(trip_model)

        # Add stops
        for s in trip.stops:
            point_wkt = f"SRID=4326;POINT({s.lon} {s.lat})"
            stop_model = TripStopModel(
                id=s.id,
                trip_id=trip.id,
                sequence_order=s.sequence_order,
                stop_type=s.stop_type.value,
                facility_id=s.facility_id,
                geom=ST_GeomFromText(point_wkt, 4326),
                planned_arrival=s.planned_arrival,
                planned_departure=s.planned_departure,
                actual_arrival=s.actual_arrival,
                actual_departure=s.actual_departure,
                status=s.status.value,
            )
            self.session.add(stop_model)

        # Link commitments and mark commitments as DISPATCHED
        for cid in trip.commitment_ids:
            tc = TripCommitmentModel(trip_id=trip.id, commitment_id=cid)
            self.session.add(tc)

            upd = sa.update(DeliveryCommitmentModel).where(
                DeliveryCommitmentModel.id == cid
            ).values(status=DeliveryStatus.DISPATCHED.value)
            await self.session.execute(upd)

        await self.session.flush()
        return await self.get_trip_by_id(trip.id)  # type: ignore

    async def update_trip_status(self, trip_id: UUID, status: TripStatus) -> Trip:
        stmt = sa.update(TripModel).where(TripModel.id == trip_id).values(
            status=status.value,
            updated_at=sa.func.now(),
        )
        await self.session.execute(stmt)

        # If cancelled or aborted, release linked commitments back to PENDING
        if status in (TripStatus.CANCELLED, TripStatus.ABORTED):
            c_stmt = sa.select(TripCommitmentModel.commitment_id).where(TripCommitmentModel.trip_id == trip_id)
            c_res = await self.session.execute(c_stmt)
            comm_ids = list(c_res.scalars().all())
            if comm_ids:
                upd_comm = sa.update(DeliveryCommitmentModel).where(
                    DeliveryCommitmentModel.id.in_(comm_ids)
                ).values(status=DeliveryStatus.PENDING.value)
                await self.session.execute(upd_comm)

        await self.session.flush()
        return await self.get_trip_by_id(trip_id)  # type: ignore

    async def list_trips(self, organization_id: UUID, status: TripStatus | None = None) -> list[Trip]:
        stmt = sa.select(TripModel).where(TripModel.organization_id == organization_id).options(
            selectinload(TripModel.stops),
            selectinload(TripModel.commitments),
        )
        if status:
            stmt = stmt.where(TripModel.status == status.value)
        stmt = stmt.order_by(TripModel.created_at.desc())
        result = await self.session.execute(stmt)
        trips: list[Trip] = []
        for m in result.scalars():
            trip = await self._to_trip_entity(m)
            trips.append(trip)
        return trips

    # ──────────────────────────────────────────────────────────
    # Entity Mappers
    # ──────────────────────────────────────────────────────────

    def _to_vehicle_entity(self, m: VehicleModel) -> Vehicle:
        return Vehicle(
            id=m.id,
            organization_id=m.organization_id,
            registration_number=m.registration_number,
            vehicle_type=VehicleType(m.vehicle_type),
            make_model=m.make_model,
            max_weight_kg=m.max_weight_kg,
            empty_weight_kg=m.empty_weight_kg,
            height_m=m.height_m,
            width_m=m.width_m,
            length_m=m.length_m,
            axle_count=m.axle_count,
            is_hazmat_capable=m.is_hazmat_capable,
            is_refrigerated=m.is_refrigerated,
            is_active=m.is_active,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )

    def _to_driver_entity(self, m: DriverModel) -> Driver:
        return Driver(
            id=m.id,
            organization_id=m.organization_id,
            user_id=m.user_id,
            full_name=m.full_name,
            phone_e164=m.phone_e164,
            license_number=m.license_number,
            license_classes=list(m.license_classes) if m.license_classes else [],
            is_active=m.is_active,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )

    def _to_commitment_entity(self, m: DeliveryCommitmentModel) -> DeliveryCommitment:
        return DeliveryCommitment(
            id=m.id,
            organization_id=m.organization_id,
            consignment_reference=m.consignment_reference,
            cargo_category=CargoCategory(m.cargo_category),
            priority_tier=PriorityTier(m.priority_tier),
            consigned_weight_kg=m.consigned_weight_kg,
            consigned_volume_m3=m.consigned_volume_m3,
            consigned_quantity_units=m.consigned_quantity_units,
            delivered_quantity_units=m.delivered_quantity_units,
            origin_facility_id=m.origin_facility_id,
            destination_facility_id=m.destination_facility_id,
            required_before=m.required_before,
            status=DeliveryStatus(m.status),
            shortage_reason=m.shortage_reason,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )

    async def _to_trip_entity(self, m: TripModel) -> Trip:
        stops: list[TripStop] = []
        for s in m.stops:
            # Query lon and lat from geom
            pt_stmt = sa.select(ST_X(s.geom), ST_Y(s.geom))
            pt_res = await self.session.execute(pt_stmt)
            lon, lat = pt_res.one()
            stops.append(
                TripStop(
                    id=s.id,
                    trip_id=s.trip_id,
                    sequence_order=s.sequence_order,
                    stop_type=StopType(s.stop_type),
                    facility_id=s.facility_id,
                    lat=float(lat),
                    lon=float(lon),
                    planned_arrival=s.planned_arrival,
                    planned_departure=s.planned_departure,
                    actual_arrival=s.actual_arrival,
                    actual_departure=s.actual_departure,
                    status=StopStatus(s.status),
                )
            )

        c_ids = [c.commitment_id for c in m.commitments]

        return Trip(
            id=m.id,
            organization_id=m.organization_id,
            vehicle_id=m.vehicle_id,
            driver_id=m.driver_id,
            trip_code=m.trip_code,
            status=TripStatus(m.status),
            current_route_snapshot_id=m.current_route_snapshot_id,
            scheduled_departure=m.scheduled_departure,
            actual_departure=m.actual_departure,
            actual_arrival=m.actual_arrival,
            created_at=m.created_at,
            updated_at=m.updated_at,
            stops=stops,
            commitment_ids=c_ids,
        )
