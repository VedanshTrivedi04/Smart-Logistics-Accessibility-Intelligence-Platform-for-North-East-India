"""
tests/integration/telemetry/test_device_auth_and_ingestion.py — Integration tests for Device Auth & Telemetry Ingestion.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
from uuid import UUID, uuid4
import pytest

from app.core.db import AsyncSessionLocal
from app.modules.telemetry.application.authenticate_device import AuthenticateDeviceUseCase
from app.modules.telemetry.application.ingest_telemetry import IngestTelemetryUseCase
from app.modules.telemetry.domain.entities import Device, RawTelemetryFix
from app.modules.telemetry.domain.enums import (
    DeviceStatus,
    DeviceType,
    FixOutcome,
    FixQuality,
)
from app.modules.telemetry.domain.exceptions import (
    DeviceAuthenticationError,
    DeviceSuspendedError,
    DeviceVehicleMismatchError,
)
from app.modules.telemetry.infrastructure.repository import SqlAlchemyTelemetryRepository

ORG_LOGISTICS_ID = UUID("00000000-0000-4000-a000-000000000003")


class TestDeviceAuthAndIngestionIntegration:
    async def test_device_authentication_and_suspension(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyTelemetryRepository(session)
            auth_use_case = AuthenticateDeviceUseCase(repo)

            raw_token = f"test-token-{uuid4().hex}"
            token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
            now = datetime.now(timezone.utc)

            # 1. Active device succeeds
            active_dev = Device(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=None,
                device_code=f"DEV-ACT-{uuid4().hex[:4].upper()}",
                device_type=DeviceType.HARDWARE_OBD_CELLULAR,
                api_key_hash=token_hash,
                status=DeviceStatus.ACTIVE,
                last_seen_at=None,
                created_at=now,
                revoked_at=None,
            )
            await repo.save_device(active_dev)

            authed = await auth_use_case.execute(raw_token)
            assert authed.id == active_dev.id

            # 2. Suspended device raises DeviceSuspendedError
            susp_token = f"susp-token-{uuid4().hex}"
            susp_hash = hashlib.sha256(susp_token.encode("utf-8")).hexdigest()
            susp_dev = Device(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=None,
                device_code=f"DEV-SUSP-{uuid4().hex[:4].upper()}",
                device_type=DeviceType.HARDWARE_OBD_CELLULAR,
                api_key_hash=susp_hash,
                status=DeviceStatus.SUSPENDED,
                last_seen_at=None,
                created_at=now,
                revoked_at=None,
            )
            await repo.save_device(susp_dev)

            with pytest.raises(DeviceSuspendedError):
                await auth_use_case.execute(susp_token)

            # 3. Invalid token raises DeviceAuthenticationError
            with pytest.raises(DeviceAuthenticationError):
                await auth_use_case.execute("completely-invalid-raw-token")

            await session.commit()

    async def test_batch_ingestion_partial_outcomes(self) -> None:
        async with AsyncSessionLocal() as session:
            from app.modules.logistics.domain.entities import Vehicle
            from app.modules.logistics.domain.enums import VehicleType
            from app.modules.logistics.infrastructure.repository import SqlAlchemyLogisticsRepository

            repo = SqlAlchemyTelemetryRepository(session)
            l_repo = SqlAlchemyLogisticsRepository(session)
            ingest_use_case = IngestTelemetryUseCase(repo)

            raw_token = f"ingest-token-{uuid4().hex}"
            token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
            now = datetime.now(timezone.utc)
            assigned_vehicle_id = uuid4()

            veh = Vehicle(
                id=assigned_vehicle_id,
                organization_id=ORG_LOGISTICS_ID,
                registration_number=f"AS-01-ING-{uuid4().hex[:4].upper()}",
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

            device = Device(
                id=uuid4(),
                organization_id=ORG_LOGISTICS_ID,
                vehicle_id=assigned_vehicle_id,
                device_code=f"DEV-ING-{uuid4().hex[:4].upper()}",
                device_type=DeviceType.HARDWARE_OBD_CELLULAR,
                api_key_hash=token_hash,
                status=DeviceStatus.ACTIVE,
                last_seen_at=None,
                created_at=now,
                revoked_at=None,
            )
            await repo.save_device(device)

            # 1. Mismatched vehicle raises DeviceVehicleMismatchError
            with pytest.raises(DeviceVehicleMismatchError):
                await ingest_use_case.execute(
                    device=device,
                    vehicle_id=uuid4(),  # Different vehicle ID
                    fixes=[
                        RawTelemetryFix(sequence_number=1, event_at=now, lat=26.11, lon=91.81)
                    ],
                )

            # 2. Batch with mixed outcomes
            fixes = [
                # Fix 1: Valid normal fix
                RawTelemetryFix(
                    sequence_number=10,
                    event_at=now - timedelta(minutes=5),
                    lat=26.1152,
                    lon=91.8153,
                    speed_kph=40.0,
                    heading_deg=175.0,
                    fix_quality=FixQuality.GPS_FIX_3D,
                ),
                # Fix 2: Future skew (> 15m in future)
                RawTelemetryFix(
                    sequence_number=11,
                    event_at=now + timedelta(minutes=25),
                    lat=26.1150,
                    lon=91.8150,
                    speed_kph=40.0,
                    heading_deg=175.0,
                ),
                # Fix 3: Speed anomaly (>140 km/h)
                RawTelemetryFix(
                    sequence_number=12,
                    event_at=now - timedelta(minutes=3),
                    lat=26.1140,
                    lon=91.8140,
                    speed_kph=185.0,  # anomalous speed
                    heading_deg=175.0,
                ),
                # Fix 4: Invalid coordinates (lat > 90)
                RawTelemetryFix(
                    sequence_number=13,
                    event_at=now - timedelta(minutes=2),
                    lat=95.0,  # impossible latitude
                    lon=91.8140,
                    speed_kph=50.0,
                ),
            ]

            batch_res = await ingest_use_case.execute(
                device=device,
                vehicle_id=assigned_vehicle_id,
                fixes=fixes,
            )

            assert batch_res.processed_count == 4
            assert batch_res.accepted_count == 2  # Fix 1 and Fix 3 (accepted with anomaly)
            assert batch_res.quarantined_count == 2  # Fix 2 (future skew) and Fix 4 (invalid coords)

            outcomes_by_seq = {r.sequence_number: r.outcome for r in batch_res.results}
            assert outcomes_by_seq[10] == FixOutcome.ACCEPTED
            assert outcomes_by_seq[11] == FixOutcome.QUARANTINED
            assert outcomes_by_seq[12] == FixOutcome.ACCEPTED_WITH_ANOMALY
            assert outcomes_by_seq[13] == FixOutcome.QUARANTINED

            # 3. Re-ingesting sequence 10 must return DUPLICATE_IGNORED
            replay_res = await ingest_use_case.execute(
                device=device,
                vehicle_id=assigned_vehicle_id,
                fixes=[
                    RawTelemetryFix(
                        sequence_number=10,
                        event_at=now - timedelta(minutes=5),
                        lat=26.1152,
                        lon=91.8153,
                    )
                ],
            )
            assert replay_res.results[0].outcome == FixOutcome.DUPLICATE_IGNORED

            await session.commit()
