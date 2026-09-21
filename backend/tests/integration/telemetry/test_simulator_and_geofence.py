"""
tests/integration/telemetry/test_simulator_and_geofence.py — Integration tests for Simulator & Stop Geofencing.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
from uuid import UUID, uuid4
import pytest

from app.core.db import AsyncSessionLocal
from app.modules.logistics.application.create_driver import CreateDriverUseCase
from app.modules.logistics.application.create_vehicle import CreateVehicleUseCase
from app.modules.logistics.application.dispatch_trip import DispatchTripUseCase
from app.modules.logistics.domain.enums import TripStatus, VehicleType
from app.modules.logistics.infrastructure.repository import SqlAlchemyLogisticsRepository
from app.modules.telemetry.application.ingest_telemetry import IngestTelemetryUseCase
from app.modules.telemetry.application.simulator import CorridorReplaySimulator
from app.modules.telemetry.domain.entities import Device, RawTelemetryFix
from app.modules.telemetry.domain.enums import DeviceStatus, DeviceType, FixQuality
from app.modules.telemetry.infrastructure.repository import SqlAlchemyTelemetryRepository

ORG_LOGISTICS_ID = UUID("00000000-0000-4000-a000-000000000003")


class TestSimulatorAndGeofenceIntegration:
    async def test_simulator_replay_pilot_corridor(self) -> None:
        async with AsyncSessionLocal() as session:
            t_repo = SqlAlchemyTelemetryRepository(session)
            sim_device_id = uuid4()
            sim_veh_id = uuid4()

            from app.modules.logistics.domain.entities import Vehicle
            from app.modules.logistics.domain.enums import VehicleType
            from app.modules.logistics.infrastructure.repository import SqlAlchemyLogisticsRepository

            l_repo = SqlAlchemyLogisticsRepository(session)
            veh = Vehicle(
                id=sim_veh_id,
                organization_id=ORG_LOGISTICS_ID,
                registration_number=f"AS-01-SIM-{uuid4().hex[:4].upper()}",
                vehicle_type=VehicleType.TRUCK_HEAVY,
                make_model="Simulator Rig",
                max_weight_kg=16000.0,
                empty_weight_kg=6000.0,
                height_m=3.5,
                width_m=2.5,
                length_m=9.0,
                axle_count=3,
                is_hazmat_capable=True,
                is_refrigerated=False,
                is_active=True,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            await l_repo.save_vehicle(veh)

            raw_token = f"sim-key-{uuid4().hex}"
            thash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
            now = datetime.now(timezone.utc)

            sim_dev = Device(
                id=sim_device_id,
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=sim_veh_id,
                device_code=f"SIM-CORR-{uuid4().hex[:4].upper()}",
                device_type=DeviceType.LABELED_SIMULATOR_REPLAY,
                api_key_hash=thash,
                status=DeviceStatus.ACTIVE,
                last_seen_at=None,
                created_at=now,
                revoked_at=None,
            )
            await t_repo.save_device(sim_dev)

            simulator = CorridorReplaySimulator(t_repo)
            batch_res = await simulator.execute(
                device=sim_dev,
                vehicle_id=sim_veh_id,
                start_sequence=1,
                step_interval_seconds=10,
            )

            assert batch_res.processed_count == 5
            assert batch_res.accepted_count == 5

            # Verify current position has is_simulated = True
            pos = await t_repo.get_current_position(sim_veh_id)
            assert pos is not None
            assert pos.is_simulated is True
            assert pos.fix_quality == FixQuality.SIMULATED_REPLAY

            # Verify breadcrumbs have is_simulated = True
            breadcrumbs = await t_repo.list_breadcrumbs(sim_veh_id, now - timedelta(hours=1), now + timedelta(hours=1))
            assert len(breadcrumbs) == 5
            assert all(b.is_simulated is True for b in breadcrumbs)

            await session.commit()

    async def test_geofence_arrival_triggers_stop_arrival(self) -> None:
        async with AsyncSessionLocal() as session:
            l_repo = SqlAlchemyLogisticsRepository(session)
            t_repo = SqlAlchemyTelemetryRepository(session)

            # 1. Create vehicle and driver
            v_use_case = CreateVehicleUseCase(l_repo)
            d_use_case = CreateDriverUseCase(l_repo)
            dispatch_use_case = DispatchTripUseCase(l_repo)

            veh = await v_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                registration_number=f"AS-01-GEO-{uuid4().hex[:4].upper()}",
                vehicle_type=VehicleType.VAN_LIGHT,
                make_model="Mahindra Bolero",
                max_weight_kg=4000.0,
                empty_weight_kg=1500.0,
                height_m=2.0,
                width_m=1.8,
                length_m=4.8,
                axle_count=2,
            )
            drv = await d_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                full_name="Rajen Das",
                phone_e164="+919864077777",
                license_number=f"ML-05-GEO-{uuid4().hex[:4].upper()}",
                license_classes=["LMV"],
            )

            # 2. Dispatch trip with a stop at Byrnihat (26.0821, 91.8684)
            now = datetime.now(timezone.utc)
            stops = [
                {"stop_type": "PICKUP", "lat": 26.1152, "lon": 91.8153, "planned_arrival": now, "planned_departure": now + timedelta(minutes=30)},
                {"stop_type": "DELIVERY", "lat": 26.0821, "lon": 91.8684, "planned_arrival": now + timedelta(hours=1), "planned_departure": now + timedelta(hours=2)},
            ]
            trip = await dispatch_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=veh.id,
                driver_id=drv.id,
                trip_code=f"TRIP-GEO-{uuid4().hex[:4].upper()}",
                scheduled_departure=now,
                stops_data=stops,
                commitment_ids=[],
            )
            assert trip.status == TripStatus.DISPATCHED

            # 3. Register device for vehicle
            dev_token = f"geo-key-{uuid4().hex}"
            thash = hashlib.sha256(dev_token.encode("utf-8")).hexdigest()
            device = Device(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=veh.id,
                device_code=f"DEV-GEO-{uuid4().hex[:4].upper()}",
                device_type=DeviceType.HARDWARE_OBD_CELLULAR,
                api_key_hash=thash,
                status=DeviceStatus.ACTIVE,
                last_seen_at=None,
                created_at=now,
                revoked_at=None,
            )
            await t_repo.save_device(device)

            # 4. Ingest telemetry fix within 50m of Byrnihat stop (26.0821, 91.8684)
            ingest_use_case = IngestTelemetryUseCase(t_repo)
            await ingest_use_case.execute(
                device=device,
                vehicle_id=veh.id,
                fixes=[
                    RawTelemetryFix(
                        sequence_number=1,
                        event_at=now + timedelta(minutes=5),
                        lat=26.0822,  # ~11m distance
                        lon=91.8685,
                        speed_kph=15.0,
                        heading_deg=175.0,
                    )
                ],
                is_simulated=False,
            )

            # 5. Verify stop was marked ARRIVED and trip became IN_TRANSIT
            refreshed_trip = await l_repo.get_trip_by_id(trip.id)
            assert refreshed_trip is not None
            assert refreshed_trip.status == TripStatus.IN_TRANSIT

            # Check Byrnihat stop (sequence 2) status
            delivery_stop = next(s for s in refreshed_trip.stops if s.sequence_order == 2)
            assert delivery_stop.status.value == "ARRIVED"
            assert delivery_stop.actual_arrival is not None

            await session.commit()
