"""
app/modules/telemetry/api/router.py — FastAPI Router for Telemetry & Vehicle Tracking.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, Query, status

from app.core.db import DbSession, get_db_session
from app.core.exceptions import ValidationError
from app.core.security import require_capability
from app.modules.identity.public import Capability, PrincipalContext
from app.modules.telemetry.api.schemas import (
    BatchIngestResponse,
    BreadcrumbResponse,
    DeviceRegisterRequest,
    DeviceResponse,
    FixResultResponse,
    SimulatorReplayRequest,
    TelemetryIngestRequest,
    VehiclePositionResponse,
)
from app.modules.telemetry.application.authenticate_device import AuthenticateDeviceUseCase
from app.modules.telemetry.application.ingest_telemetry import IngestTelemetryUseCase
from app.modules.telemetry.application.simulator import CorridorReplaySimulator
from app.modules.telemetry.domain.entities import (
    Device,
    RawTelemetryFix,
)
from app.modules.telemetry.domain.enums import DeviceStatus, DeviceType
from app.modules.telemetry.domain.exceptions import (
    DeviceNotFoundError,
    VehiclePositionNotFoundError,
)
from app.modules.telemetry.infrastructure.repository import SqlAlchemyTelemetryRepository

router = APIRouter(prefix="/telemetry", tags=["Telemetry & Tracking"])


# ──────────────────────────────────────────────────────────────
# Device Management
# ──────────────────────────────────────────────────────────────

@router.post("/devices", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
async def register_device(
    payload: DeviceRegisterRequest,
    principal: PrincipalContext = Depends(require_capability(Capability.VIEW_FLEET)),
    session: DbSession = Depends(get_db_session),
) -> DeviceResponse:
    repo = SqlAlchemyTelemetryRepository(session)

    token_hash = hashlib.sha256(payload.raw_api_key.strip().encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    device = Device(
        id=uuid4(),
        organization_id=principal.org_id,
        vehicle_id=payload.vehicle_id,
        device_code=payload.device_code.strip().upper(),
        device_type=payload.device_type,
        api_key_hash=token_hash,
        status=DeviceStatus.ACTIVE,
        last_seen_at=None,
        created_at=now,
        revoked_at=None,
    )
    saved = await repo.save_device(device)
    # Handlers own the transaction: get_db() does not commit, so without this the write is rolled back.
    await session.commit()
    return DeviceResponse(
        id=saved.id,
        organization_id=saved.organization_id,
        vehicle_id=saved.vehicle_id,
        device_code=saved.device_code,
        device_type=saved.device_type,
        status=saved.status,
        last_seen_at=saved.last_seen_at,
        created_at=saved.created_at,
    )


# ──────────────────────────────────────────────────────────────
# Telemetry Ingestion (Device-Authenticated)
# ──────────────────────────────────────────────────────────────

@router.post("/ingest", response_model=BatchIngestResponse, status_code=status.HTTP_200_OK)
async def ingest_telemetry(
    payload: TelemetryIngestRequest,
    x_device_token: str | None = Header(None, alias="X-Device-Token"),
    session: DbSession = Depends(get_db_session),
) -> BatchIngestResponse:
    if not x_device_token:
        raise ValidationError("Missing required header: X-Device-Token")

    repo = SqlAlchemyTelemetryRepository(session)
    auth_use_case = AuthenticateDeviceUseCase(repo)
    device = await auth_use_case.execute(x_device_token)

    ingest_use_case = IngestTelemetryUseCase(repo)
    raw_fixes = [
        RawTelemetryFix(
            sequence_number=f.sequence_number,
            event_at=f.event_at,
            lat=f.lat,
            lon=f.lon,
            speed_kph=f.speed_kph,
            heading_deg=f.heading_deg,
            altitude_m=f.altitude_m,
            battery_pct=f.battery_pct,
            fix_quality=f.fix_quality,
        )
        for f in payload.fixes
    ]

    result = await ingest_use_case.execute(
        device=device,
        vehicle_id=payload.vehicle_id,
        fixes=raw_fixes,
        is_simulated=False,
    )

    # Handlers own the transaction: get_db() does not commit, so without this the write is rolled back.
    await session.commit()
    return BatchIngestResponse(
        device_id=result.device_id,
        vehicle_id=result.vehicle_id,
        processed_count=result.processed_count,
        accepted_count=result.accepted_count,
        quarantined_count=result.quarantined_count,
        rejected_count=result.rejected_count,
        results=[
            FixResultResponse(
                sequence_number=r.sequence_number,
                outcome=r.outcome,
                reason=r.reason,
            )
            for r in result.results
        ],
    )


# ──────────────────────────────────────────────────────────────
# Position & Breadcrumbs (Operator / Portal Authenticated)
# ──────────────────────────────────────────────────────────────

@router.get("/vehicles/{vehicle_id}/position", response_model=VehiclePositionResponse)
async def get_vehicle_position(
    vehicle_id: UUID,
    principal: PrincipalContext = Depends(require_capability(Capability.VIEW_FLEET)),
    session: DbSession = Depends(get_db_session),
) -> VehiclePositionResponse:
    repo = SqlAlchemyTelemetryRepository(session)
    pos = await repo.get_current_position(vehicle_id)
    if pos is None:
        raise VehiclePositionNotFoundError(f"No current position reported for vehicle '{vehicle_id}'")
    return VehiclePositionResponse.from_entity(pos)


@router.get("/vehicles/{vehicle_id}/breadcrumbs", response_model=list[BreadcrumbResponse])
async def get_vehicle_breadcrumbs(
    vehicle_id: UUID,
    start_time: datetime = Query(...),
    end_time: datetime = Query(...),
    principal: PrincipalContext = Depends(require_capability(Capability.VIEW_FLEET)),
    session: DbSession = Depends(get_db_session),
) -> list[BreadcrumbResponse]:
    # Validate maximum query window (7 days)
    if (end_time - start_time).total_seconds() > 7 * 86400:
        raise ValidationError("Query time range cannot exceed 7 days")
    if start_time > end_time:
        raise ValidationError("start_time cannot be after end_time")

    repo = SqlAlchemyTelemetryRepository(session)
    breadcrumbs = await repo.list_breadcrumbs(vehicle_id, start_time, end_time)
    return [
        BreadcrumbResponse(
            id=b.id,
            vehicle_id=b.vehicle_id,
            device_id=b.device_id,
            trip_id=b.trip_id,
            lat=b.lat,
            lon=b.lon,
            event_at=b.event_at,
            received_at=b.received_at,
            sequence_number=b.sequence_number,
            speed_kph=b.speed_kph,
            heading_deg=b.heading_deg,
            fix_quality=b.fix_quality,
            source_type=b.source_type,
            is_anomalous_speed=b.is_anomalous_speed,
            is_simulated=b.is_simulated,
        )
        for b in breadcrumbs
    ]


# ──────────────────────────────────────────────────────────────
# Simulator Replay
# ──────────────────────────────────────────────────────────────

@router.post("/simulator/replay", response_model=BatchIngestResponse)
async def replay_synthetic_corridor(
    payload: SimulatorReplayRequest,
    x_device_token: str | None = Header(None, alias="X-Device-Token"),
    principal: PrincipalContext = Depends(require_capability(Capability.VIEW_FLEET)),
    session: DbSession = Depends(get_db_session),
) -> BatchIngestResponse:
    repo = SqlAlchemyTelemetryRepository(session)

    # If x_device_token provided, authenticate device, else lookup/create a simulator device
    if x_device_token:
        auth_use_case = AuthenticateDeviceUseCase(repo)
        device = await auth_use_case.execute(x_device_token)
    else:
        # Find or create standard simulator device for org
        sim_code = f"SIM-{principal.org_id.hex[:6].upper()}"
        device = await repo.get_device_by_code(sim_code)
        if not device:
            device = Device(
                id=uuid4(),
                organization_id=principal.org_id,
                vehicle_id=payload.vehicle_id,
                device_code=sim_code,
                device_type=DeviceType.LABELED_SIMULATOR_REPLAY,
                api_key_hash=hashlib.sha256(b"sim-default-key").hexdigest(),
                status=DeviceStatus.ACTIVE,
                last_seen_at=None,
                created_at=datetime.now(timezone.utc),
                revoked_at=None,
            )
            device = await repo.save_device(device)

    simulator = CorridorReplaySimulator(repo)
    result = await simulator.execute(
        device=device,
        vehicle_id=payload.vehicle_id,
        start_sequence=payload.start_sequence,
        step_interval_seconds=payload.step_interval_seconds,
    )

    # Handlers own the transaction: get_db() does not commit, so without this the write is rolled back.
    await session.commit()
    return BatchIngestResponse(
        device_id=result.device_id,
        vehicle_id=result.vehicle_id,
        processed_count=result.processed_count,
        accepted_count=result.accepted_count,
        quarantined_count=result.quarantined_count,
        rejected_count=result.rejected_count,
        results=[
            FixResultResponse(
                sequence_number=r.sequence_number,
                outcome=r.outcome,
                reason=r.reason,
            )
            for r in result.results
        ],
    )
