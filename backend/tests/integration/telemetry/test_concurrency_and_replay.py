"""
tests/integration/telemetry/test_concurrency_and_replay.py — Concurrency and anti-replay safety tests.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
from uuid import UUID, uuid4
import pytest

from app.core.db import AsyncSessionLocal
from app.modules.telemetry.application.ingest_telemetry import IngestTelemetryUseCase
from app.modules.telemetry.domain.entities import Device, RawTelemetryFix
from app.modules.telemetry.domain.enums import DeviceStatus, DeviceType, FixOutcome
from app.modules.telemetry.infrastructure.repository import SqlAlchemyTelemetryRepository

ORG_LOGISTICS_ID = UUID("00000000-0000-4000-a000-000000000003")


class TestConcurrencyAndReplayIntegration:
    async def test_concurrent_telemetry_cannot_regress_ledger(self) -> None:
        """
        Two concurrent batches submitted for the same device must be serialized
        by row-level locking so that ledger sequence number reaches max and never regresses.
        """
        device_id = uuid4()
        vehicle_id = uuid4()
        raw_token = f"concur-token-{uuid4().hex}"
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        now = datetime.now(timezone.utc)

        # Setup device in DB
        async with AsyncSessionLocal() as setup_session:
            from app.modules.logistics.domain.entities import Vehicle
            from app.modules.logistics.domain.enums import VehicleType
            from app.modules.logistics.infrastructure.repository import SqlAlchemyLogisticsRepository

            l_repo = SqlAlchemyLogisticsRepository(setup_session)
            veh = Vehicle(
                id=vehicle_id,
                organization_id=ORG_LOGISTICS_ID,
                registration_number=f"AS-01-CR-{uuid4().hex[:4].upper()}",
                vehicle_type=VehicleType.TRUCK_MEDIUM,
                make_model="Test Truck",
                max_weight_kg=10000.0,
                empty_weight_kg=4000.0,
                height_m=3.0,
                width_m=2.4,
                length_m=7.0,
                axle_count=2,
                is_hazmat_capable=True,
                is_refrigerated=False,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            await l_repo.save_vehicle(veh)

            repo = SqlAlchemyTelemetryRepository(setup_session)
            dev = Device(
                id=device_id,
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=vehicle_id,
                device_code=f"DEV-CONCUR-{uuid4().hex[:4].upper()}",
                device_type=DeviceType.HARDWARE_OBD_CELLULAR,
                api_key_hash=token_hash,
                status=DeviceStatus.ACTIVE,
                last_seen_at=None,
                created_at=now,
                revoked_at=None,
            )
            await repo.save_device(dev)
            await setup_session.commit()

        # Define two distinct tasks with overlapping and interleaved sequences
        async def run_batch_1():
            async with AsyncSessionLocal() as s1:
                r1 = SqlAlchemyTelemetryRepository(s1)
                use_case1 = IngestTelemetryUseCase(r1)
                res = await use_case1.execute(
                    device=dev,
                    vehicle_id=vehicle_id,
                    fixes=[
                        RawTelemetryFix(sequence_number=50, event_at=now - timedelta(minutes=5), lat=26.11, lon=91.81),
                        RawTelemetryFix(sequence_number=51, event_at=now - timedelta(minutes=4), lat=26.12, lon=91.82),
                    ],
                )
                await s1.commit()
                return res

        async def run_batch_2():
            async with AsyncSessionLocal() as s2:
                r2 = SqlAlchemyTelemetryRepository(s2)
                use_case2 = IngestTelemetryUseCase(r2)
                res = await use_case2.execute(
                    device=dev,
                    vehicle_id=vehicle_id,
                    fixes=[
                        RawTelemetryFix(sequence_number=52, event_at=now - timedelta(minutes=3), lat=26.13, lon=91.83),
                        RawTelemetryFix(sequence_number=53, event_at=now - timedelta(minutes=2), lat=26.14, lon=91.84),
                    ],
                )
                await s2.commit()
                return res

        # Execute concurrently
        results = await asyncio.gather(run_batch_1(), run_batch_2())
        assert len(results) == 2

        # Verify final ledger in DB
        async with AsyncSessionLocal() as verify_session:
            v_repo = SqlAlchemyTelemetryRepository(verify_session)
            final_ledger = await v_repo.get_replay_ledger(device_id)
            assert final_ledger is not None
            # The ledger MUST reflect sequence 53, never regressing to 51
            assert final_ledger.last_sequence_number == 53

    async def test_concurrent_fixes_cannot_overwrite_newer_position(self) -> None:
        """
        An older fix arriving after a newer fix cannot overwrite the current position.
        """
        device_id = uuid4()
        vehicle_id = uuid4()
        raw_token = f"pos-token-{uuid4().hex}"
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        now = datetime.now(timezone.utc)

        async with AsyncSessionLocal() as session:
            from app.modules.logistics.domain.entities import Vehicle
            from app.modules.logistics.domain.enums import VehicleType
            from app.modules.logistics.infrastructure.repository import SqlAlchemyLogisticsRepository

            l_repo = SqlAlchemyLogisticsRepository(session)
            veh = Vehicle(
                id=vehicle_id,
                organization_id=ORG_LOGISTICS_ID,
                registration_number=f"AS-01-POS-{uuid4().hex[:4].upper()}",
                vehicle_type=VehicleType.TRUCK_MEDIUM,
                make_model="Test Truck",
                max_weight_kg=10000.0,
                empty_weight_kg=4000.0,
                height_m=3.0,
                width_m=2.4,
                length_m=7.0,
                axle_count=2,
                is_hazmat_capable=True,
                is_refrigerated=False,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            await l_repo.save_vehicle(veh)

            repo = SqlAlchemyTelemetryRepository(session)
            dev = Device(
                id=device_id,
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=vehicle_id,
                device_code=f"DEV-POS-{uuid4().hex[:4].upper()}",
                device_type=DeviceType.HARDWARE_OBD_CELLULAR,
                api_key_hash=token_hash,
                status=DeviceStatus.ACTIVE,
                last_seen_at=None,
                created_at=now,
                revoked_at=None,
            )
            await repo.save_device(dev)

            use_case = IngestTelemetryUseCase(repo)

            # Step 1: Ingest newer fix (now - 2m)
            newer_time = now - timedelta(minutes=2)
            await use_case.execute(
                device=dev,
                vehicle_id=vehicle_id,
                fixes=[
                    RawTelemetryFix(sequence_number=100, event_at=newer_time, lat=26.1152, lon=91.8153, speed_kph=45.0)
                ],
            )
            await session.commit()

        # Step 2: Ingest older fix (now - 10m) from a secondary batch with higher sequence (e.g. clock shifted back)
        async with AsyncSessionLocal() as session2:
            repo2 = SqlAlchemyTelemetryRepository(session2)
            use_case2 = IngestTelemetryUseCase(repo2)
            older_time = now - timedelta(minutes=10)

            res = await use_case2.execute(
                device=dev,
                vehicle_id=vehicle_id,
                fixes=[
                    RawTelemetryFix(sequence_number=101, event_at=older_time, lat=26.0500, lon=91.7500, speed_kph=30.0)
                ],
            )
            await session2.commit()

        # Step 3: Current position must still have coordinates of newer fix (26.1152, 91.8153)
        async with AsyncSessionLocal() as session3:
            repo3 = SqlAlchemyTelemetryRepository(session3)
            current_pos = await repo3.get_current_position(vehicle_id)
            assert current_pos is not None
            assert current_pos.lat == pytest.approx(26.1152, abs=1e-3)
            assert current_pos.lon == pytest.approx(91.8153, abs=1e-3)
            assert current_pos.speed_kph == 45.0
