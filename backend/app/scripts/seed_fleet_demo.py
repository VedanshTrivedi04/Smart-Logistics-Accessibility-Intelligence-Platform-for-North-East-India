"""
app/scripts/seed_fleet_demo.py — Idempotent seeding script for Phase 5 Fleet & Telemetry.
"""

from __future__ import annotations

import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import sqlalchemy as sa
from geoalchemy2.functions import ST_GeomFromText
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_engine
from app.modules.logistics.infrastructure.models import (
    DeliveryCommitmentModel,
    DriverModel,
    TripCommitmentModel,
    TripModel,
    TripStopModel,
    VehicleModel,
)
from app.modules.network.infrastructure.models import FacilityModel
from app.modules.telemetry.infrastructure.models import (
    DeviceModel,
    DeviceReplayLedgerModel,
    PositionBreadcrumbModel,
    VehicleCurrentPositionModel,
)


async def seed_fleet_demo_data(session: AsyncSession) -> None:
    # 1. Fetch default organization
    res = await session.execute(sa.text("SELECT id FROM organizations LIMIT 1"))
    org_id = res.scalar_one_or_none()
    if not org_id:
        print("[seed_fleet] No organizations found. Run base seed first.")
        return

    # 2. Fetch facilities
    fac_res = await session.execute(sa.select(FacilityModel).limit(3))
    facilities = list(fac_res.scalars().all())
    origin_fac = facilities[0] if facilities else None
    dest_fac = facilities[1] if len(facilities) > 1 else origin_fac

    if not origin_fac or not dest_fac:
        print("[seed_fleet] Insufficient facilities for delivery commitments. Run corridor seed first.")
        return

    now = datetime.now(UTC)

    # 3. Vehicles
    vehicles_data = [
        {
            "reg": "AS-01-HC-9821",
            "type": "TRUCK_HEAVY",
            "model": "Tata Prima 2830.K",
            "max_wt": 24000.0,
            "emp_wt": 8000.0,
            "h": 3.8,
            "w": 2.5,
            "l": 10.5,
            "axles": 3,
            "hazmat": True,
            "refrig": False,
        },
        {
            "reg": "AS-01-RF-4412",
            "type": "VAN_LIGHT",
            "model": "Force Pharma Reefer",
            "max_wt": 5000.0,
            "emp_wt": 2200.0,
            "h": 2.8,
            "w": 2.1,
            "l": 6.2,
            "axles": 2,
            "hazmat": False,
            "refrig": True,
        },
        {
            "reg": "ML-05-EM-1102",
            "type": "FOUR_WHEEL_DRIVE",
            "model": "Mahindra Bolero Camper 4x4",
            "max_wt": 3000.0,
            "emp_wt": 1700.0,
            "h": 1.9,
            "w": 1.8,
            "l": 4.9,
            "axles": 2,
            "hazmat": True,
            "refrig": False,
        },
    ]

    saved_vehicles: dict[str, VehicleModel] = {}
    for v in vehicles_data:
        check = await session.execute(sa.select(VehicleModel).where(VehicleModel.registration_number == v["reg"]))
        veh = check.scalar_one_or_none()
        if not veh:
            veh = VehicleModel(
                id=uuid4(),
                organization_id=org_id,
                registration_number=v["reg"],
                vehicle_type=v["type"],
                make_model=v["model"],
                max_weight_kg=v["max_wt"],
                empty_weight_kg=v["emp_wt"],
                height_m=v["h"],
                width_m=v["w"],
                length_m=v["l"],
                axle_count=v["axles"],
                is_hazmat_capable=v["hazmat"],
                is_refrigerated=v["refrig"],
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            session.add(veh)
            await session.flush()
        saved_vehicles[v["reg"]] = veh

    # 4. Drivers
    drivers_data = [
        {"name": "Biren Kalita", "phone": "+919864012345", "lic": "AS-01-20150039211"},
        {"name": "Deepak Sharma", "phone": "+919435098765", "lic": "AS-01-20180092812"},
        {"name": "Mary Lyngdoh", "phone": "+919774054321", "lic": "ML-05-20200012948"},
    ]
    saved_drivers: list[DriverModel] = []
    for d in drivers_data:
        check = await session.execute(sa.select(DriverModel).where(DriverModel.license_number == d["lic"]))
        drv = check.scalar_one_or_none()
        if not drv:
            drv = DriverModel(
                id=uuid4(),
                organization_id=org_id,
                user_id=None,
                full_name=d["name"],
                phone_e164=d["phone"],
                license_number=d["lic"],
                license_classes=["HMV", "TRANS"],
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            session.add(drv)
            await session.flush()
        saved_drivers.append(drv)

    # 5. Devices
    devices_data = [
        {"code": "OBD-AS01-HC-9821", "token": "dev-device-token-heavy-truck", "veh": saved_vehicles["AS-01-HC-9821"]},
        {"code": "OBD-AS01-RF-4412", "token": "dev-device-token-pharma-van", "veh": saved_vehicles["AS-01-RF-4412"]},
    ]
    saved_devices: dict[str, DeviceModel] = {}
    for dev in devices_data:
        check = await session.execute(sa.select(DeviceModel).where(DeviceModel.device_code == dev["code"]))
        d_model = check.scalar_one_or_none()
        if not d_model:
            thash = hashlib.sha256(dev["token"].encode("utf-8")).hexdigest()
            d_model = DeviceModel(
                id=uuid4(),
                organization_id=org_id,
                vehicle_id=dev["veh"].id,
                device_code=dev["code"],
                device_type="HARDWARE_OBD_CELLULAR",
                api_key_hash=thash,
                status="ACTIVE",
                last_seen_at=now,
                created_at=now,
                revoked_at=None,
            )
            session.add(d_model)
            await session.flush()
        saved_devices[dev["code"]] = d_model

    # 6. Delivery Commitments
    commitments_data = [
        {
            "ref": "MED-SHG-2026-001",
            "cat": "CRITICAL_MEDICAL",
            "tier": "TIER_1_LIFE_SAVING",
            "wt": 2500.0,
            "qty": 50,
            "sla": now + timedelta(hours=6),
        },
        {
            "ref": "VAC-NPH-2026-002",
            "cat": "COLD_CHAIN_VACCINES",
            "tier": "TIER_1_LIFE_SAVING",
            "wt": 450.0,
            "qty": 2000,
            "sla": now + timedelta(hours=4),
        },
        {
            "ref": "REL-RSN-2026-003",
            "cat": "RELIEF_FOOD_WATER",
            "tier": "TIER_2_ESSENTIAL",
            "wt": 15000.0,
            "qty": 1000,
            "sla": now + timedelta(hours=12),
        },
    ]
    saved_commitments: list[DeliveryCommitmentModel] = []
    for c in commitments_data:
        check = await session.execute(sa.select(DeliveryCommitmentModel).where(DeliveryCommitmentModel.consignment_reference == c["ref"]))
        comm = check.scalar_one_or_none()
        if not comm:
            comm = DeliveryCommitmentModel(
                id=uuid4(),
                organization_id=org_id,
                consignment_reference=c["ref"],
                cargo_category=c["cat"],
                priority_tier=c["tier"],
                consigned_weight_kg=c["wt"],
                consigned_volume_m3=None,
                consigned_quantity_units=c["qty"],
                delivered_quantity_units=0,
                origin_facility_id=origin_fac.id,
                destination_facility_id=dest_fac.id,
                required_before=c["sla"],
                status="PENDING",
                shortage_reason=None,
                created_at=now,
                updated_at=now,
            )
            session.add(comm)
            await session.flush()
        saved_commitments.append(comm)

    # 7. Trip
    trip_code = "TRIP-NER-2026-001"
    check_t = await session.execute(sa.select(TripModel).where(TripModel.trip_code == trip_code))
    trip = check_t.scalar_one_or_none()
    if not trip:
        pharma_veh = saved_vehicles["AS-01-RF-4412"]
        driver = saved_drivers[0]
        trip = TripModel(
            id=uuid4(),
            organization_id=org_id,
            vehicle_id=pharma_veh.id,
            driver_id=driver.id,
            trip_code=trip_code,
            status="IN_TRANSIT",
            current_route_snapshot_id=None,
            scheduled_departure=now - timedelta(minutes=45),
            actual_departure=now - timedelta(minutes=40),
            actual_arrival=None,
            created_at=now - timedelta(hours=1),
            updated_at=now,
        )
        session.add(trip)

        # Stops
        stops_coords = [
            (26.1152, 91.8153, "PICKUP", origin_fac.id),
            (25.9080, 91.8795, "DELIVERY", dest_fac.id),
        ]
        for s_idx, (lat, lon, stype, fac_id) in enumerate(stops_coords):
            stop_model = TripStopModel(
                id=uuid4(),
                trip_id=trip.id,
                sequence_order=s_idx + 1,
                stop_type=stype,
                facility_id=fac_id,
                geom=ST_GeomFromText(f"SRID=4326;POINT({lon} {lat})", 4326),
                planned_arrival=now + timedelta(hours=s_idx),
                planned_departure=now + timedelta(hours=s_idx, minutes=30),
                actual_arrival=now - timedelta(minutes=40) if s_idx == 0 else None,
                actual_departure=now - timedelta(minutes=35) if s_idx == 0 else None,
                status="DEPARTED" if s_idx == 0 else "PENDING",
            )
            session.add(stop_model)

        # Link Vaccine commitment
        vac_comm = saved_commitments[1]
        session.add(TripCommitmentModel(trip_id=trip.id, commitment_id=vac_comm.id))
        vac_comm.status = "IN_TRANSIT"

        # 8. Seed current position and replay ledger for Pharma Van
        pharma_dev = saved_devices["OBD-AS01-RF-4412"]
        curr_pt = "SRID=4326;POINT(91.8684 26.0821)"  # near Byrnihat
        pos = VehicleCurrentPositionModel(
            vehicle_id=pharma_veh.id,
            device_id=pharma_dev.id,
            active_trip_id=trip.id,
            geom=ST_GeomFromText(curr_pt, 4326),
            event_at=now - timedelta(minutes=2),
            received_at=now,
            speed_kph=42.5,
            heading_deg=175.0,
            altitude_m=160.0,
            battery_pct=92.0,
            fix_quality="GPS_FIX_3D",
            source_type="HARDWARE_OBD_CELLULAR",
            source_rank=1,
            snapped_edge_id=None,
            is_simulated=False,
            updated_at=now,
        )
        session.add(pos)

        ledger = DeviceReplayLedgerModel(
            device_id=pharma_dev.id,
            vehicle_id=pharma_veh.id,
            last_sequence_number=105,
            last_event_at=now - timedelta(minutes=2),
            last_received_at=now,
            updated_at=now,
        )
        session.add(ledger)

        bc = PositionBreadcrumbModel(
            id=uuid4(),
            vehicle_id=pharma_veh.id,
            device_id=pharma_dev.id,
            trip_id=trip.id,
            geom=ST_GeomFromText(curr_pt, 4326),
            event_at=now - timedelta(minutes=2),
            received_at=now,
            sequence_number=105,
            speed_kph=42.5,
            heading_deg=175.0,
            fix_quality="GPS_FIX_3D",
            source_type="HARDWARE_OBD_CELLULAR",
            is_anomalous_speed=False,
            is_simulated=False,
            created_at=now,
        )
        session.add(bc)

    await session.commit()
    print("[seed_fleet] Successfully seeded vehicles, drivers, devices, commitments, and demo trip!")


async def main() -> None:
    engine = get_engine()
    async with AsyncSession(engine) as session:
        await seed_fleet_demo_data(session)


if __name__ == "__main__":
    asyncio.run(main())
