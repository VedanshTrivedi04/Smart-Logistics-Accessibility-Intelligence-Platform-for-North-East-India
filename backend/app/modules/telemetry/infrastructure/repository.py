"""
app/modules/telemetry/infrastructure/repository.py — PostGIS & SQLAlchemy Repository for Telemetry.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from geoalchemy2 import Geometry
from geoalchemy2.functions import ST_DWithin, ST_GeomFromText, ST_X, ST_Y
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.logistics.infrastructure.models import TripModel, TripStopModel
from app.modules.telemetry.application.ports import TelemetryRepositoryPort
from app.modules.telemetry.domain.entities import (
    BreadcrumbPoint,
    Device,
    DeviceReplayLedger,
    VehicleCurrentPosition,
)
from app.modules.telemetry.domain.enums import (
    DeviceStatus,
    DeviceType,
    FixQuality,
)
from app.modules.telemetry.infrastructure.models import (
    DeviceModel,
    DeviceReplayLedgerModel,
    PositionBreadcrumbModel,
    VehicleCurrentPositionModel,
)


class SqlAlchemyTelemetryRepository(TelemetryRepositoryPort):
    def __init__(self, session: AsyncSession):
        self.session = session

    # ──────────────────────────────────────────────────────────
    # Devices
    # ──────────────────────────────────────────────────────────

    async def get_device_by_token_hash(self, token_hash: str) -> Device | None:
        stmt = sa.select(DeviceModel).where(DeviceModel.api_key_hash == token_hash)
        result = await self.session.execute(stmt)
        m = result.scalar_one_or_none()
        return self._to_device_entity(m) if m else None

    async def get_device_by_id(self, device_id: UUID) -> Device | None:
        stmt = sa.select(DeviceModel).where(DeviceModel.id == device_id)
        result = await self.session.execute(stmt)
        m = result.scalar_one_or_none()
        return self._to_device_entity(m) if m else None

    async def get_device_by_code(self, device_code: str) -> Device | None:
        stmt = sa.select(DeviceModel).where(DeviceModel.device_code == device_code)
        result = await self.session.execute(stmt)
        m = result.scalar_one_or_none()
        return self._to_device_entity(m) if m else None

    async def save_device(self, device: Device) -> Device:
        model = DeviceModel(
            id=device.id,
            organization_id=device.organization_id,
            vehicle_id=device.vehicle_id,
            device_code=device.device_code,
            device_type=device.device_type.value,
            api_key_hash=device.api_key_hash,
            status=device.status.value,
            last_seen_at=device.last_seen_at,
            created_at=device.created_at,
            revoked_at=device.revoked_at,
        )
        self.session.add(model)
        await self.session.flush()
        return self._to_device_entity(model)

    async def update_device_last_seen(self, device_id: UUID, last_seen_at: datetime) -> None:
        stmt = sa.update(DeviceModel).where(DeviceModel.id == device_id).values(last_seen_at=last_seen_at)
        await self.session.execute(stmt)

    # ──────────────────────────────────────────────────────────
    # Replay Ledgers
    # ──────────────────────────────────────────────────────────

    async def get_replay_ledger(self, device_id: UUID, for_update: bool = False) -> DeviceReplayLedger | None:
        stmt = sa.select(DeviceReplayLedgerModel).where(DeviceReplayLedgerModel.device_id == device_id)
        if for_update:
            stmt = stmt.with_for_update()
        result = await self.session.execute(stmt)
        m = result.scalar_one_or_none()
        if not m:
            return None
        return DeviceReplayLedger(
            device_id=m.device_id,
            vehicle_id=m.vehicle_id,
            last_sequence_number=m.last_sequence_number,
            last_event_at=m.last_event_at,
            last_received_at=m.last_received_at,
            updated_at=m.updated_at,
        )

    async def save_replay_ledger(self, ledger: DeviceReplayLedger) -> None:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        stmt = (
            pg_insert(DeviceReplayLedgerModel)
            .values(
                device_id=ledger.device_id,
                vehicle_id=ledger.vehicle_id,
                last_sequence_number=ledger.last_sequence_number,
                last_event_at=ledger.last_event_at,
                last_received_at=ledger.last_received_at,
                updated_at=ledger.updated_at,
            )
            .on_conflict_do_update(
                index_elements=[DeviceReplayLedgerModel.device_id],
                set_={
                    "vehicle_id": ledger.vehicle_id,
                    "last_sequence_number": sa.func.greatest(
                        DeviceReplayLedgerModel.last_sequence_number,
                        ledger.last_sequence_number,
                    ),
                    "last_event_at": ledger.last_event_at,
                    "last_received_at": ledger.last_received_at,
                    "updated_at": ledger.updated_at,
                },
            )
        )
        await self.session.execute(stmt)
        await self.session.flush()

    # ──────────────────────────────────────────────────────────
    # Current Positions
    # ──────────────────────────────────────────────────────────

    async def get_current_position(self, vehicle_id: UUID, for_update: bool = False) -> VehicleCurrentPosition | None:
        stmt = sa.select(VehicleCurrentPositionModel).where(VehicleCurrentPositionModel.vehicle_id == vehicle_id)
        if for_update:
            stmt = stmt.with_for_update()
        result = await self.session.execute(stmt)
        m = result.scalar_one_or_none()
        if not m:
            return None

        # Fetch coordinates
        coord_stmt = sa.select(ST_X(m.geom), ST_Y(m.geom))
        coord_res = await self.session.execute(coord_stmt)
        lon, lat = coord_res.one()

        return VehicleCurrentPosition(
            vehicle_id=m.vehicle_id,
            device_id=m.device_id,
            active_trip_id=m.active_trip_id,
            lat=float(lat),
            lon=float(lon),
            event_at=m.event_at,
            received_at=m.received_at,
            speed_kph=m.speed_kph,
            heading_deg=m.heading_deg,
            altitude_m=m.altitude_m,
            battery_pct=m.battery_pct,
            fix_quality=FixQuality(m.fix_quality),
            source_type=DeviceType(m.source_type),
            source_rank=m.source_rank,
            snapped_edge_id=m.snapped_edge_id,
            is_simulated=m.is_simulated,
            updated_at=m.updated_at,
        )

    async def upsert_current_position(self, pos: VehicleCurrentPosition) -> None:
        point_wkt = f"SRID=4326;POINT({pos.lon} {pos.lat})"
        stmt = sa.select(VehicleCurrentPositionModel).where(VehicleCurrentPositionModel.vehicle_id == pos.vehicle_id)
        res = await self.session.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            existing.device_id = pos.device_id
            existing.active_trip_id = pos.active_trip_id
            existing.geom = ST_GeomFromText(point_wkt, 4326)
            existing.event_at = pos.event_at
            existing.received_at = pos.received_at
            existing.speed_kph = pos.speed_kph
            existing.heading_deg = pos.heading_deg
            existing.altitude_m = pos.altitude_m
            existing.battery_pct = pos.battery_pct
            existing.fix_quality = pos.fix_quality.value
            existing.source_type = pos.source_type.value
            existing.source_rank = pos.source_rank
            existing.snapped_edge_id = pos.snapped_edge_id
            existing.is_simulated = pos.is_simulated
            existing.updated_at = pos.updated_at
        else:
            model = VehicleCurrentPositionModel(
                vehicle_id=pos.vehicle_id,
                device_id=pos.device_id,
                active_trip_id=pos.active_trip_id,
                geom=ST_GeomFromText(point_wkt, 4326),
                event_at=pos.event_at,
                received_at=pos.received_at,
                speed_kph=pos.speed_kph,
                heading_deg=pos.heading_deg,
                altitude_m=pos.altitude_m,
                battery_pct=pos.battery_pct,
                fix_quality=pos.fix_quality.value,
                source_type=pos.source_type.value,
                source_rank=pos.source_rank,
                snapped_edge_id=pos.snapped_edge_id,
                is_simulated=pos.is_simulated,
                updated_at=pos.updated_at,
            )
            self.session.add(model)
        await self.session.flush()

    # ──────────────────────────────────────────────────────────
    # Breadcrumbs
    # ──────────────────────────────────────────────────────────

    async def save_breadcrumbs(self, breadcrumbs: list[BreadcrumbPoint]) -> None:
        for bc in breadcrumbs:
            point_wkt = f"SRID=4326;POINT({bc.lon} {bc.lat})"
            model = PositionBreadcrumbModel(
                id=bc.id,
                vehicle_id=bc.vehicle_id,
                device_id=bc.device_id,
                trip_id=bc.trip_id,
                geom=ST_GeomFromText(point_wkt, 4326),
                event_at=bc.event_at,
                received_at=bc.received_at,
                sequence_number=bc.sequence_number,
                speed_kph=bc.speed_kph,
                heading_deg=bc.heading_deg,
                fix_quality=bc.fix_quality.value,
                source_type=bc.source_type.value,
                is_anomalous_speed=bc.is_anomalous_speed,
                is_simulated=bc.is_simulated,
                created_at=bc.created_at,
            )
            self.session.add(model)
        await self.session.flush()

    async def list_breadcrumbs(
        self,
        vehicle_id: UUID,
        start_time: datetime,
        end_time: datetime,
    ) -> list[BreadcrumbPoint]:
        stmt = sa.select(PositionBreadcrumbModel).where(
            PositionBreadcrumbModel.vehicle_id == vehicle_id,
            PositionBreadcrumbModel.event_at >= start_time,
            PositionBreadcrumbModel.event_at <= end_time,
        ).order_by(PositionBreadcrumbModel.event_at.asc())

        result = await self.session.execute(stmt)
        models = list(result.scalars().all())

        breadcrumbs: list[BreadcrumbPoint] = []
        for m in models:
            coord_stmt = sa.select(ST_X(m.geom), ST_Y(m.geom))
            coord_res = await self.session.execute(coord_stmt)
            lon, lat = coord_res.one()

            breadcrumbs.append(
                BreadcrumbPoint(
                    id=m.id,
                    vehicle_id=m.vehicle_id,
                    device_id=m.device_id,
                    trip_id=m.trip_id,
                    lat=float(lat),
                    lon=float(lon),
                    event_at=m.event_at,
                    received_at=m.received_at,
                    sequence_number=m.sequence_number,
                    speed_kph=m.speed_kph,
                    heading_deg=m.heading_deg,
                    fix_quality=FixQuality(m.fix_quality),
                    source_type=DeviceType(m.source_type),
                    is_anomalous_speed=m.is_anomalous_speed,
                    is_simulated=m.is_simulated,
                    created_at=m.created_at,
                )
            )
        return breadcrumbs

    # ──────────────────────────────────────────────────────────
    # Active Trip & Geofencing
    # ──────────────────────────────────────────────────────────

    async def get_active_trip_for_vehicle(self, vehicle_id: UUID) -> UUID | None:
        stmt = sa.select(TripModel.id).where(
            TripModel.vehicle_id == vehicle_id,
            TripModel.status.in_(["DISPATCHED", "IN_TRANSIT"]),
        ).order_by(TripModel.created_at.desc()).limit(1)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def check_and_update_stop_geofence(
        self,
        trip_id: UUID,
        current_lat: float,
        current_lon: float,
        arrival_time: datetime,
    ) -> UUID | None:
        """
        Evaluates distance to the next pending stop for trip_id.
        If distance < 150m, marks stop ARRIVED and updates actual_arrival.
        """
        point_wkt = f"SRID=4326;POINT({current_lon} {current_lat})"
        pt_geom = ST_GeomFromText(point_wkt, 4326)

        # Find next pending stop within 150m (approx 0.00135 degrees)
        stmt = sa.select(TripStopModel).where(
            TripStopModel.trip_id == trip_id,
            TripStopModel.status == "PENDING",
            ST_DWithin(
                sa.cast(TripStopModel.geom, Geometry("POINT", 4326)),
                sa.cast(pt_geom, Geometry("POINT", 4326)),
                0.00135,
            ),
        ).order_by(TripStopModel.sequence_order.asc()).limit(1)

        res = await self.session.execute(stmt)
        stop = res.scalar_one_or_none()

        if stop:
            stop.status = "ARRIVED"
            stop.actual_arrival = arrival_time

            # Also transition trip to IN_TRANSIT if currently DISPATCHED
            t_stmt = sa.select(TripModel).where(TripModel.id == trip_id)
            t_res = await self.session.execute(t_stmt)
            trip = t_res.scalar_one_or_none()
            if trip and trip.status == "DISPATCHED":
                trip.status = "IN_TRANSIT"
                trip.actual_departure = arrival_time

            await self.session.flush()
            return stop.id

        return None

    def _to_device_entity(self, m: DeviceModel) -> Device:
        return Device(
            id=m.id,
            organization_id=m.organization_id,
            vehicle_id=m.vehicle_id,
            device_code=m.device_code,
            device_type=DeviceType(m.device_type),
            api_key_hash=m.api_key_hash,
            status=DeviceStatus(m.status),
            last_seen_at=m.last_seen_at,
            created_at=m.created_at,
            revoked_at=m.revoked_at,
        )
