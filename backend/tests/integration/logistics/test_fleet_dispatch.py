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
    DeliveryStatus,
    PriorityTier,
    TripStatus,
    VehicleType,
)
from app.modules.logistics.domain.exceptions import (
    ResourceAlreadyDispatchedError,
    VehicleCapacityExceededError,
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
