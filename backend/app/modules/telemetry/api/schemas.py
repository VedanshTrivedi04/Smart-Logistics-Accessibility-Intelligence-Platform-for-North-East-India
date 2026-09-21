"""
app/modules/telemetry/api/schemas.py — Pydantic DTOs for Telemetry API.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.telemetry.domain.entities import derive_stale_status
from app.modules.telemetry.domain.enums import (
    DeviceStatus,
    DeviceType,
    FixOutcome,
    FixQuality,
    StaleStatus,
)


class RawTelemetryFixInput(BaseModel):
    sequence_number: int = Field(..., ge=0)
    event_at: datetime
    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=180.0)
    speed_kph: float = Field(default=0.0, ge=0.0)
    heading_deg: float = Field(default=0.0, ge=0.0, lt=360.0)
    altitude_m: float | None = None
    battery_pct: float | None = Field(default=None, ge=0.0, le=100.0)
    fix_quality: FixQuality = FixQuality.GPS_FIX_3D


class TelemetryIngestRequest(BaseModel):
    vehicle_id: UUID
    fixes: list[RawTelemetryFixInput] = Field(..., min_length=1, max_length=100)


class FixResultResponse(BaseModel):
    sequence_number: int
    outcome: FixOutcome
    reason: str | None = None


class BatchIngestResponse(BaseModel):
    device_id: UUID
    vehicle_id: UUID
    processed_count: int
    accepted_count: int
    quarantined_count: int
    rejected_count: int
    results: list[FixResultResponse]


class VehiclePositionResponse(BaseModel):
    vehicle_id: UUID
    device_id: UUID | None
    active_trip_id: UUID | None
    lat: float
    lon: float
    event_at: datetime
    received_at: datetime
    speed_kph: float
    heading_deg: float
    altitude_m: float | None
    battery_pct: float | None
    fix_quality: FixQuality
    source_type: DeviceType
    stale_status: StaleStatus
    is_simulated: bool
    updated_at: datetime

    @classmethod
    def from_entity(cls, pos) -> VehiclePositionResponse:
        stale = derive_stale_status(pos.event_at, datetime.now(timezone.utc))
        return cls(
            vehicle_id=pos.vehicle_id,
            device_id=pos.device_id,
            active_trip_id=pos.active_trip_id,
            lat=pos.lat,
            lon=pos.lon,
            event_at=pos.event_at,
            received_at=pos.received_at,
            speed_kph=pos.speed_kph,
            heading_deg=pos.heading_deg,
            altitude_m=pos.altitude_m,
            battery_pct=pos.battery_pct,
            fix_quality=pos.fix_quality,
            source_type=pos.source_type,
            stale_status=stale,
            is_simulated=pos.is_simulated,
            updated_at=pos.updated_at,
        )


class BreadcrumbResponse(BaseModel):
    id: UUID
    vehicle_id: UUID
    device_id: UUID | None
    trip_id: UUID | None
    lat: float
    lon: float
    event_at: datetime
    received_at: datetime
    sequence_number: int | None
    speed_kph: float
    heading_deg: float
    fix_quality: FixQuality
    source_type: DeviceType
    is_anomalous_speed: bool
    is_simulated: bool


class SimulatorReplayRequest(BaseModel):
    vehicle_id: UUID
    start_sequence: int = Field(default=1, ge=0)
    step_interval_seconds: int = Field(default=30, ge=1, le=300)


class DeviceRegisterRequest(BaseModel):
    device_code: str = Field(..., min_length=3, max_length=64)
    device_type: DeviceType
    raw_api_key: str = Field(..., min_length=16, max_length=128)
    vehicle_id: UUID | None = None


class DeviceResponse(BaseModel):
    id: UUID
    organization_id: UUID
    vehicle_id: UUID | None
    device_code: str
    device_type: DeviceType
    status: DeviceStatus
    last_seen_at: datetime | None
    created_at: datetime
