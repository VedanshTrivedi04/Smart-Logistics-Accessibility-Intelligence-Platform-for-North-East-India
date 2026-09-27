"""
tests/integration/logistics/test_fleet_dispatch.py — Integration tests for Fleet Registration, Dispatch & PII.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4
import pytest

from app.core.db import AsyncSessionLocal
from app.modules.identity.domain.enums import Capability, OrgKind, Role
from app.modules.identity.domain.principal import PrincipalContext
from app.modules.logistics.application.create_driver import CreateDriverUseCase
from app.modules.logistics.application.create_vehicle import CreateVehicleUseCase
from app.modules.logistics.application.dispatch_trip import DispatchTripUseCase
from app.modules.logistics.application.update_trip_status import UpdateTripStatusUseCase
from app.modules.logistics.domain.entities import DeliveryCommitment, mask_license, mask_phone
from app.modules.logistics.domain.enums import (
    CargoCategory,
    DeliveryCondition,
    DeliveryStatus,
    PriorityTier,
    TripStatus,
    VehicleType,
)
from app.modules.logistics.domain.exceptions import (
    InvalidDeliveryStateTransitionError,
    ResourceAlreadyDispatchedError,
    VehicleCapacityExceededError,
    VehicleColdChainIncapableError,
    VehicleHazmatIncapableError,
)
from app.modules.logistics.infrastructure.repository import SqlAlchemyLogisticsRepository

ORG_LOGISTICS_ID = UUID("00000000-0000-4000-a000-000000000003")
USER_FLEET_MANAGER = UUID("d0000008-0000-4000-8000-000000000008")


@pytest.fixture
def fleet_manager_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=USER_FLEET_MANAGER,
        org_id=ORG_LOGISTICS_ID,
        org_name="NER Integrated Logistics Consortium",
        org_kind=OrgKind.LOGISTICS,
        role=Role.FLEET_MANAGER,
        capabilities=frozenset([
            Capability.VIEW_FLEET,
            Capability.COMPUTE_ROUTE,
            Capability.DISPATCH_ROUTE,
            Capability.VIEW_DRIVER_PII,
        ]),
        jurisdiction_ids=frozenset(),
    )


class TestFleetDispatchIntegration:
    async def test_create_vehicle_and_list(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyLogisticsRepository(session)
            use_case = CreateVehicleUseCase(repo)

            unique_reg = f"AS-01-TEST-{uuid4().hex[:4].upper()}"
            vehicle = await use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                registration_number=unique_reg,
                vehicle_type=VehicleType.TRUCK_MEDIUM,
                make_model="Ashok Leyland Ecomet",
                max_weight_kg=12000.0,
                empty_weight_kg=4500.0,
                height_m=3.2,
                width_m=2.4,
                length_m=7.5,
                axle_count=2,
                is_hazmat_capable=True,
                is_refrigerated=False,
            )
            assert vehicle.id is not None
            assert vehicle.registration_number == unique_reg

            listed = await repo.list_vehicles(ORG_LOGISTICS_ID, is_active=True)
            assert any(v.registration_number == unique_reg for v in listed)
            await session.commit()

    async def test_create_driver_and_pii_redaction(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyLogisticsRepository(session)
            use_case = CreateDriverUseCase(repo)

            unique_lic = f"AS-01-{uuid4().hex[:6].upper()}"
            driver = await use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                full_name="Pranab Gogoi",
                phone_e164="+919864019999",
                license_number=unique_lic,
                license_classes=["HMV"],
            )
            assert driver.full_name == "Pranab Gogoi"

            # Check masking rules
            masked_phone = mask_phone(driver.phone_e164)
            masked_lic = mask_license(driver.license_number)

            assert "*****" in masked_phone
            assert "9999" not in masked_phone
            assert "-****-" in masked_lic
            await session.commit()

    async def test_dispatch_trip_and_capacity_check(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyLogisticsRepository(session)
            dispatch_use_case = DispatchTripUseCase(repo)

            # Create test vehicle with 5000 kg capacity
            veh_use_case = CreateVehicleUseCase(repo)
            reg = f"AS-01-CAP-{uuid4().hex[:4].upper()}"
            vehicle = await veh_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                registration_number=reg,
                vehicle_type=VehicleType.VAN_LIGHT,
                make_model="Mahindra Bolero Maxi",
                max_weight_kg=5000.0,
                empty_weight_kg=1800.0,
                height_m=2.2,
                width_m=1.8,
                length_m=5.0,
                axle_count=2,
                is_hazmat_capable=True,
                is_refrigerated=True,
            )

            # Create test driver
            drv_use_case = CreateDriverUseCase(repo)
            lic = f"ML-05-{uuid4().hex[:6].upper()}"
            driver = await drv_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                full_name="Hiren Nath",
                phone_e164="+919864088888",
                license_number=lic,
                license_classes=["LMV"],
            )

            # Query valid facilities for foreign key constraints
            from app.modules.network.infrastructure.models import FacilityModel
            import sqlalchemy as sa
            fac_res = await session.execute(sa.select(FacilityModel.id).limit(2))
            fac_ids = fac_res.scalars().all()
            fac_origin = fac_ids[0] if fac_ids else uuid4()
            fac_dest = fac_ids[1] if len(fac_ids) > 1 else fac_origin

            # Create overweight commitment (6000 kg > 5000 kg)
            now = datetime.now(timezone.utc)
            overweight_comm = DeliveryCommitment(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                consignment_reference=f"REF-OVER-{uuid4().hex[:4].upper()}",
                cargo_category=CargoCategory.GENERAL_SUPPLIES,
                priority_tier=PriorityTier.TIER_3_STANDARD,
                consigned_weight_kg=6000.0,
                consigned_volume_m3=None,
                consigned_quantity_units=100,
                delivered_quantity_units=0,
                origin_facility_id=fac_origin,
                destination_facility_id=fac_dest,
                required_before=now + timedelta(hours=8),
                status=DeliveryStatus.PENDING,
                shortage_reason=None,
                created_at=now,
                updated_at=now,
            )
            await repo.save_commitment(overweight_comm)

            stops = [
                {"stop_type": "PICKUP", "lat": 26.1152, "lon": 91.8153, "planned_arrival": now, "planned_departure": now + timedelta(minutes=30)},
                {"stop_type": "DELIVERY", "lat": 25.9080, "lon": 91.8795, "planned_arrival": now + timedelta(hours=1), "planned_departure": now + timedelta(hours=2)},
            ]

            # 1. Over capacity must raise error
            with pytest.raises(VehicleCapacityExceededError):
                await dispatch_use_case.execute(
                    organization_id=ORG_LOGISTICS_ID,
                    vehicle_id=vehicle.id,
                    driver_id=driver.id,
                    trip_code=f"TRIP-FAIL-{uuid4().hex[:4].upper()}",
                    scheduled_departure=now,
                    stops_data=stops,
                    commitment_ids=[overweight_comm.id],
                )

            # 2. Within capacity succeeds
            valid_comm = DeliveryCommitment(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                consignment_reference=f"REF-OK-{uuid4().hex[:4].upper()}",
                cargo_category=CargoCategory.GENERAL_SUPPLIES,
                priority_tier=PriorityTier.TIER_3_STANDARD,
                consigned_weight_kg=3500.0,
                consigned_volume_m3=None,
                consigned_quantity_units=50,
                delivered_quantity_units=0,
                origin_facility_id=fac_origin,
                destination_facility_id=fac_dest,
                required_before=now + timedelta(hours=8),
                status=DeliveryStatus.PENDING,
                shortage_reason=None,
                created_at=now,
                updated_at=now,
            )
            await repo.save_commitment(valid_comm)

            trip_code = f"TRIP-OK-{uuid4().hex[:4].upper()}"
            trip = await dispatch_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=vehicle.id,
                driver_id=driver.id,
                trip_code=trip_code,
                scheduled_departure=now,
                stops_data=stops,
                commitment_ids=[valid_comm.id],
            )
            assert trip.status == TripStatus.DISPATCHED
            assert len(trip.stops) == 2

            # 3. Attempting double-assignment must raise ResourceAlreadyDispatchedError
            with pytest.raises(ResourceAlreadyDispatchedError):
                await dispatch_use_case.execute(
                    organization_id=ORG_LOGISTICS_ID,
                    vehicle_id=vehicle.id,  # Same vehicle already on active trip
                    driver_id=driver.id,
                    trip_code=f"TRIP-DOUBLE-{uuid4().hex[:4].upper()}",
                    scheduled_departure=now,
                    stops_data=stops,
                    commitment_ids=[],
                )

            # 4. Transition trip to CANCELLED and verify commitment is reset to PENDING
            status_use_case = UpdateTripStatusUseCase(repo)
            cancelled_trip = await status_use_case.execute(trip.id, TripStatus.CANCELLED)
            assert cancelled_trip.status == TripStatus.CANCELLED

            refreshed_comm = await repo.get_commitment_by_id(valid_comm.id)
            assert refreshed_comm.status == DeliveryStatus.PENDING

            await session.commit()

    async def test_commitment_lifecycle_and_trip_sync(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyLogisticsRepository(session)
            now = datetime.now(timezone.utc)

            from app.modules.network.infrastructure.models import FacilityModel
            import sqlalchemy as sa
            fac_res = await session.execute(sa.select(FacilityModel.id).limit(2))
            fac_ids = fac_res.scalars().all()
            fac_origin = fac_ids[0]
            fac_dest = fac_ids[1] if len(fac_ids) > 1 else fac_origin

            v_use_case = CreateVehicleUseCase(repo)
            veh = await v_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                registration_number=f"TRK-SYNC-{uuid4().hex[:4].upper()}",
                vehicle_type=VehicleType.TRUCK_MEDIUM,
                make_model="Tata 1109 LPT",
                max_weight_kg=8000.0,
                empty_weight_kg=3500.0,
                height_m=3.0,
                width_m=2.3,
                length_m=7.0,
                axle_count=2,
                is_hazmat_capable=False,
                is_refrigerated=True,
            )

            d_use_case = CreateDriverUseCase(repo)
            drv = await d_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                full_name="Bhaben Kalita",
                phone_e164="+919876543210",
                license_number="AS-01-2022-998877",
                license_classes=["HMV"],
                user_id=None,
            )

            comm = DeliveryCommitment(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                consignment_reference=f"MED-DEL-{uuid4().hex[:4].upper()}",
                cargo_category=CargoCategory.CRITICAL_MEDICAL,
                priority_tier=PriorityTier.TIER_1_LIFE_SAVING,
                consigned_weight_kg=600.0,
                consigned_volume_m3=2.5,
                consigned_quantity_units=20,
                delivered_quantity_units=0,
                origin_facility_id=fac_origin,
                destination_facility_id=fac_dest,
                required_before=now + timedelta(hours=6),
                status=DeliveryStatus.PENDING,
                shortage_reason=None,
                created_at=now,
                updated_at=now,
            )
            await repo.save_commitment(comm)

            # Dispatch trip
            stops = [
                {"sequence_order": 1, "stop_type": "PICKUP", "facility_id": str(fac_origin), "lat": 26.18, "lon": 91.75, "planned_arrival": now, "planned_departure": now + timedelta(minutes=30)},
                {"sequence_order": 2, "stop_type": "DELIVERY", "facility_id": str(fac_dest), "lat": 25.57, "lon": 91.88, "planned_arrival": now + timedelta(hours=3), "planned_departure": now + timedelta(hours=4)},
            ]
            dispatch_use_case = DispatchTripUseCase(repo)
            trip = await dispatch_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=veh.id,
                driver_id=drv.id,
                trip_code=f"TR-SYNC-{uuid4().hex[:4].upper()}",
                scheduled_departure=now,
                stops_data=stops,
                commitment_ids=[comm.id],
            )
            assert trip.status == TripStatus.DISPATCHED

            # Check commitment marked DISPATCHED
            c1 = await repo.get_commitment_by_id(comm.id)
            assert c1 is not None
            assert c1.status == DeliveryStatus.DISPATCHED

            # Transition trip to IN_TRANSIT -> commitment marked IN_TRANSIT
            status_use_case = UpdateTripStatusUseCase(repo)
            t_transit = await status_use_case.execute(trip.id, TripStatus.IN_TRANSIT)
            assert t_transit.status == TripStatus.IN_TRANSIT
            assert t_transit.actual_departure is not None

            c2 = await repo.get_commitment_by_id(comm.id)
            assert c2 is not None
            assert c2.status == DeliveryStatus.IN_TRANSIT

            # Transition trip to COMPLETED -> trip completed, but commitment remains IN_TRANSIT awaiting POD
            t_comp = await status_use_case.execute(trip.id, TripStatus.COMPLETED)
            assert t_comp.status == TripStatus.COMPLETED
            assert t_comp.actual_arrival is not None

            c3 = await repo.get_commitment_by_id(comm.id)
            assert c3 is not None
            assert c3.status == DeliveryStatus.IN_TRANSIT  # Decoupled from blind trip completion!

            # Submit authoritative POD -> commitment becomes DELIVERED
            updated_comm = await repo.update_commitment_status(
                commitment_id=comm.id,
                status=DeliveryStatus.DELIVERED,
                delivered_units=20,
                recipient_name="Dr. Hiren Saikia",
                recipient_organization="Guwahati Civil Hospital",
                delivery_condition=DeliveryCondition.GOOD,
                pod_signature_acknowledgement="DR_HIREN_CONFIRMED_20_UNITS",
            )
            assert updated_comm is not None
            assert updated_comm.status == DeliveryStatus.DELIVERED
            assert updated_comm.delivered_quantity_units == 20
            assert updated_comm.recipient_name == "Dr. Hiren Saikia"
            assert updated_comm.delivery_condition == DeliveryCondition.GOOD
            assert updated_comm.pod_timestamp is not None

            await session.commit()

    async def test_cancellation_preserves_history_and_reason(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyLogisticsRepository(session)
            now = datetime.now(timezone.utc)

            from app.modules.network.infrastructure.models import FacilityModel
            import sqlalchemy as sa
            fac_res = await session.execute(sa.select(FacilityModel.id).limit(2))
            fac_ids = fac_res.scalars().all()
            fac_origin = fac_ids[0]
            fac_dest = fac_ids[1] if len(fac_ids) > 1 else fac_origin

            v_use_case = CreateVehicleUseCase(repo)
            veh = await v_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                registration_number=f"TRK-CNCL-{uuid4().hex[:4].upper()}",
                vehicle_type=VehicleType.TRUCK_MEDIUM,
                make_model="Tata Signa",
                max_weight_kg=9000.0,
                empty_weight_kg=4000.0,
                height_m=3.0,
                width_m=2.3,
                length_m=7.0,
                axle_count=2,
                is_hazmat_capable=False,
                is_refrigerated=False,
            )

            d_use_case = CreateDriverUseCase(repo)
            drv = await d_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                full_name="Monojit Dutta",
                phone_e164="+919876543299",
                license_number=f"AS-01-{uuid4().hex[:6].upper()}",
                license_classes=["HMV"],
                user_id=None,
            )

            comm = DeliveryCommitment(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                consignment_reference=f"MED-CNCL-{uuid4().hex[:4].upper()}",
                cargo_category=CargoCategory.RELIEF_FOOD_WATER,
                priority_tier=PriorityTier.TIER_2_ESSENTIAL,
                consigned_weight_kg=1200.0,
                consigned_volume_m3=4.0,
                consigned_quantity_units=100,
                delivered_quantity_units=0,
                origin_facility_id=fac_origin,
                destination_facility_id=fac_dest,
                required_before=now + timedelta(hours=12),
                status=DeliveryStatus.PENDING,
                shortage_reason=None,
                created_at=now,
                updated_at=now,
            )
            await repo.save_commitment(comm)

            stops = [
                {"sequence_order": 1, "stop_type": "PICKUP", "facility_id": str(fac_origin), "lat": 26.18, "lon": 91.75, "planned_arrival": now, "planned_departure": now + timedelta(minutes=30)},
                {"sequence_order": 2, "stop_type": "DELIVERY", "facility_id": str(fac_dest), "lat": 25.57, "lon": 91.88, "planned_arrival": now + timedelta(hours=3), "planned_departure": now + timedelta(hours=4)},
            ]
            dispatch_use_case = DispatchTripUseCase(repo)
            trip_code = f"TR-CNCL-{uuid4().hex[:4].upper()}"
            trip = await dispatch_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=veh.id,
                driver_id=drv.id,
                trip_code=trip_code,
                scheduled_departure=now,
                stops_data=stops,
                commitment_ids=[comm.id],
            )
            assert trip.status == TripStatus.DISPATCHED

            # Trip cancelled due to road blockage
            cancellation_reason = "NH-6 rockfall blocking corridor near Sonapur"
            status_use_case = UpdateTripStatusUseCase(repo)
            t_cancelled = await status_use_case.execute(
                trip_id=trip.id,
                target_status=TripStatus.CANCELLED,
                cancellation_reason=cancellation_reason,
            )
            assert t_cancelled.status == TripStatus.CANCELLED

            # Verify commitment returns to PENDING with preserved cancellation audit fields
            c_released = await repo.get_commitment_by_id(comm.id)
            assert c_released is not None
            assert c_released.status == DeliveryStatus.PENDING
            assert c_released.previous_trip_code == trip_code
            assert c_released.previous_trip_status == "CANCELLED"
            assert c_released.cancellation_reason == cancellation_reason
            assert c_released.released_at is not None

            await session.commit()

    async def test_partial_delivery_and_authoritative_pod(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyLogisticsRepository(session)
            now = datetime.now(timezone.utc)

            from app.modules.network.infrastructure.models import FacilityModel
            import sqlalchemy as sa
            fac_res = await session.execute(sa.select(FacilityModel.id).limit(2))
            fac_ids = fac_res.scalars().all()
            fac_origin = fac_ids[0]
            fac_dest = fac_ids[1] if len(fac_ids) > 1 else fac_origin

            v_use_case = CreateVehicleUseCase(repo)
            veh = await v_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                registration_number=f"TRK-PART-{uuid4().hex[:4].upper()}",
                vehicle_type=VehicleType.TRUCK_MEDIUM,
                make_model="Ashok Leyland Partner",
                max_weight_kg=7500.0,
                empty_weight_kg=3200.0,
                height_m=2.9,
                width_m=2.2,
                length_m=6.5,
                axle_count=2,
                is_hazmat_capable=False,
                is_refrigerated=False,
            )

            d_use_case = CreateDriverUseCase(repo)
            drv = await d_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                full_name="Rajen Baruah",
                phone_e164="+919876543288",
                license_number=f"AS-01-{uuid4().hex[:6].upper()}",
                license_classes=["HMV"],
                user_id=None,
            )

            comm = DeliveryCommitment(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                consignment_reference=f"MED-PART-{uuid4().hex[:4].upper()}",
                cargo_category=CargoCategory.GENERAL_SUPPLIES,
                priority_tier=PriorityTier.TIER_3_STANDARD,
                consigned_weight_kg=2500.0,
                consigned_volume_m3=6.0,
                consigned_quantity_units=500,
                delivered_quantity_units=0,
                origin_facility_id=fac_origin,
                destination_facility_id=fac_dest,
                required_before=now + timedelta(hours=24),
                status=DeliveryStatus.PENDING,
                shortage_reason=None,
                created_at=now,
                updated_at=now,
            )
            await repo.save_commitment(comm)

            stops = [
                {"sequence_order": 1, "stop_type": "PICKUP", "facility_id": str(fac_origin), "lat": 26.18, "lon": 91.75, "planned_arrival": now, "planned_departure": now + timedelta(minutes=30)},
                {"sequence_order": 2, "stop_type": "DELIVERY", "facility_id": str(fac_dest), "lat": 25.57, "lon": 91.88, "planned_arrival": now + timedelta(hours=3), "planned_departure": now + timedelta(hours=4)},
            ]
            dispatch_use_case = DispatchTripUseCase(repo)
            trip = await dispatch_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=veh.id,
                driver_id=drv.id,
                trip_code=f"TR-PART-{uuid4().hex[:4].upper()}",
                scheduled_departure=now,
                stops_data=stops,
                commitment_ids=[comm.id],
            )
            status_use_case = UpdateTripStatusUseCase(repo)
            await status_use_case.execute(trip.id, TripStatus.IN_TRANSIT)

            # Record partial handover: 420 out of 500 units delivered, 80 units shortage
            shortage_note = "Road access narrowness prevented full unloading at Nongpoh Facility"
            partial_comm = await repo.update_commitment_status(
                commitment_id=comm.id,
                status=DeliveryStatus.PARTIALLY_DELIVERED,
                delivered_units=420,
                shortage_reason=shortage_note,
                recipient_name="Deepak Sharma",
                recipient_organization="Nongpoh Community Depot",
                delivery_condition=DeliveryCondition.GOOD,
                pod_signature_acknowledgement="DEEPAK_SHARMA_PARTIAL_420",
            )
            assert partial_comm is not None
            assert partial_comm.status == DeliveryStatus.PARTIALLY_DELIVERED
            assert partial_comm.delivered_quantity_units == 420
            assert partial_comm.consigned_quantity_units == 500
            assert partial_comm.shortage_reason == shortage_note
            assert partial_comm.recipient_name == "Deepak Sharma"
            assert partial_comm.delivery_condition == DeliveryCondition.GOOD

            await session.commit()

    async def test_illegal_state_transition_fails(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyLogisticsRepository(session)
            now = datetime.now(timezone.utc)

            from app.modules.network.infrastructure.models import FacilityModel
            import sqlalchemy as sa
            fac_res = await session.execute(sa.select(FacilityModel.id).limit(1))
            fac_origin = fac_res.scalars().first()

            comm = DeliveryCommitment(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                consignment_reference=f"MED-FSM-{uuid4().hex[:4].upper()}",
                cargo_category=CargoCategory.CRITICAL_MEDICAL,
                priority_tier=PriorityTier.TIER_1_LIFE_SAVING,
                consigned_weight_kg=100.0,
                consigned_volume_m3=0.5,
                consigned_quantity_units=10,
                delivered_quantity_units=10,
                origin_facility_id=fac_origin,
                destination_facility_id=fac_origin,
                required_before=now + timedelta(hours=6),
                status=DeliveryStatus.DELIVERED,
                shortage_reason=None,
                created_at=now,
                updated_at=now,
            )
            await repo.save_commitment(comm)

            # DELIVERED -> PENDING is illegal
            with pytest.raises(InvalidDeliveryStateTransitionError):
                await repo.update_commitment_status(
                    commitment_id=comm.id,
                    status=DeliveryStatus.PENDING,
                )

            # Create fresh PENDING commitment
            comm_pending = DeliveryCommitment(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                consignment_reference=f"MED-PEN-{uuid4().hex[:4].upper()}",
                cargo_category=CargoCategory.CRITICAL_MEDICAL,
                priority_tier=PriorityTier.TIER_1_LIFE_SAVING,
                consigned_weight_kg=100.0,
                consigned_volume_m3=0.5,
                consigned_quantity_units=10,
                delivered_quantity_units=0,
                origin_facility_id=fac_origin,
                destination_facility_id=fac_origin,
                required_before=now + timedelta(hours=6),
                status=DeliveryStatus.PENDING,
                shortage_reason=None,
                created_at=now,
                updated_at=now,
            )
            await repo.save_commitment(comm_pending)

            # PENDING -> DELIVERED directly without dispatch/transit is illegal
            with pytest.raises(InvalidDeliveryStateTransitionError):
                await repo.update_commitment_status(
                    commitment_id=comm_pending.id,
                    status=DeliveryStatus.DELIVERED,
                    delivered_units=10,
                )

    async def test_hazmat_and_cold_chain_dispatch_validation(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyLogisticsRepository(session)
            now = datetime.now(timezone.utc)

            from app.modules.network.infrastructure.models import FacilityModel
            import sqlalchemy as sa
            fac_res = await session.execute(sa.select(FacilityModel.id).limit(2))
            fac_ids = fac_res.scalars().all()
            fac_origin = fac_ids[0]
            fac_dest = fac_ids[1] if len(fac_ids) > 1 else fac_origin

            # Vehicle: NOT hazmat capable, NOT refrigerated, cap = 2000 kg
            v_use_case = CreateVehicleUseCase(repo)
            veh = await v_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                registration_number=f"TRK-VAL-{uuid4().hex[:4].upper()}",
                vehicle_type=VehicleType.VAN_LIGHT,
                make_model="Mahindra Bolero Maxi Truck",
                max_weight_kg=2000.0,
                empty_weight_kg=1500.0,
                height_m=2.2,
                width_m=1.8,
                length_m=5.0,
                axle_count=2,
                is_hazmat_capable=False,
                is_refrigerated=False,
            )

            d_use_case = CreateDriverUseCase(repo)
            drv = await d_use_case.execute(
                organization_id=ORG_LOGISTICS_ID,
                full_name="Gautom Borah",
                phone_e164="+919876543277",
                license_number=f"AS-01-{uuid4().hex[:6].upper()}",
                license_classes=["LMV"],
                user_id=None,
            )

            # Hazmat commitment
            comm_hazmat = DeliveryCommitment(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                consignment_reference=f"OXY-HAZ-{uuid4().hex[:4].upper()}",
                cargo_category=CargoCategory.OXYGEN_CYLINDERS,
                priority_tier=PriorityTier.TIER_1_LIFE_SAVING,
                consigned_weight_kg=500.0,
                consigned_volume_m3=1.5,
                consigned_quantity_units=15,
                delivered_quantity_units=0,
                origin_facility_id=fac_origin,
                destination_facility_id=fac_dest,
                required_before=now + timedelta(hours=6),
                status=DeliveryStatus.PENDING,
                shortage_reason=None,
                is_hazmat=True,
                requires_cold_chain=False,
                created_at=now,
                updated_at=now,
            )
            await repo.save_commitment(comm_hazmat)

            dispatch_use_case = DispatchTripUseCase(repo)
            stops = [
                {"sequence_order": 1, "stop_type": "PICKUP", "facility_id": str(fac_origin), "lat": 26.18, "lon": 91.75, "planned_arrival": now, "planned_departure": now + timedelta(minutes=30)},
                {"sequence_order": 2, "stop_type": "DELIVERY", "facility_id": str(fac_dest), "lat": 25.57, "lon": 91.88, "planned_arrival": now + timedelta(hours=3), "planned_departure": now + timedelta(hours=4)},
            ]

            # Fails: vehicle is not hazmat certified
            with pytest.raises(VehicleHazmatIncapableError):
                await dispatch_use_case.execute(
                    organization_id=ORG_LOGISTICS_ID,
                    vehicle_id=veh.id,
                    driver_id=drv.id,
                    trip_code=f"TR-HAZ-{uuid4().hex[:4].upper()}",
                    scheduled_departure=now,
                    stops_data=stops,
                    commitment_ids=[comm_hazmat.id],
                )

            # Cold chain commitment
            comm_cold = DeliveryCommitment(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                consignment_reference=f"VAC-COLD-{uuid4().hex[:4].upper()}",
                cargo_category=CargoCategory.COLD_CHAIN_VACCINES,
                priority_tier=PriorityTier.TIER_1_LIFE_SAVING,
                consigned_weight_kg=300.0,
                consigned_volume_m3=1.0,
                consigned_quantity_units=20,
                delivered_quantity_units=0,
                origin_facility_id=fac_origin,
                destination_facility_id=fac_dest,
                required_before=now + timedelta(hours=6),
                status=DeliveryStatus.PENDING,
                shortage_reason=None,
                is_hazmat=False,
                requires_cold_chain=True,
                created_at=now,
                updated_at=now,
            )
            await repo.save_commitment(comm_cold)

            # Fails: vehicle lacks refrigeration
            with pytest.raises(VehicleColdChainIncapableError):
                await dispatch_use_case.execute(
                    organization_id=ORG_LOGISTICS_ID,
                    vehicle_id=veh.id,
                    driver_id=drv.id,
                    trip_code=f"TR-COLD-{uuid4().hex[:4].upper()}",
                    scheduled_departure=now,
                    stops_data=stops,
                    commitment_ids=[comm_cold.id],
                )
