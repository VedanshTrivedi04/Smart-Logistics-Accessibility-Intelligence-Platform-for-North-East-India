"""
app/modules/telemetry/domain/entities.py — Domain entities & business rules for Telemetry.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import math
from uuid import UUID

from app.modules.telemetry.domain.enums import (
    DeviceStatus,
    DeviceType,
    FixOutcome,
    FixQuality,
    QuarantineReason,
    StaleStatus,
)


@dataclass(frozen=True)
class Device:
    id: UUID
    organization_id: UUID
    vehicle_id: UUID | None
    device_code: str
    device_type: DeviceType
    api_key_hash: str
    status: DeviceStatus
    last_seen_at: datetime | None
    created_at: datetime
    revoked_at: datetime | None


@dataclass(frozen=True)
class RawTelemetryFix:
    sequence_number: int
    event_at: datetime
    lat: float
    lon: float
    speed_kph: float = 0.0
    heading_deg: float = 0.0
    altitude_m: float | None = None
    battery_pct: float | None = None
    fix_quality: FixQuality = FixQuality.GPS_FIX_3D


@dataclass(frozen=True)
class DeviceReplayLedger:
    device_id: UUID
    vehicle_id: UUID
    last_sequence_number: int
    last_event_at: datetime
    last_received_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class VehicleCurrentPosition:
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
    source_rank: int
    snapped_edge_id: UUID | None
    is_simulated: bool
    updated_at: datetime


@dataclass(frozen=True)
class BreadcrumbPoint:
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
    created_at: datetime


@dataclass(frozen=True)
class FixResult:
    sequence_number: int
    outcome: FixOutcome
    reason: str | None = None


@dataclass(frozen=True)
class BatchIngestResult:
    device_id: UUID
    vehicle_id: UUID
    processed_count: int
    accepted_count: int
    quarantined_count: int
    rejected_count: int
    results: list[FixResult]


# ──────────────────────────────────────────────────────────────
# Pure Domain Business Rules
# ──────────────────────────────────────────────────────────────

def derive_stale_status(event_at: datetime, now_utc: datetime | None = None) -> StaleStatus:
    """
    Derives stale marker status strictly based on elapsed time:
    - FRESH: age < 300s (5m)
    - AGING: 300s <= age < 900s (15m)
    - STALE_WARNING: 900s <= age < 3600s (60m)
    - FEED_OFFLINE: age >= 3600s (1 hour)
    """
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)

    if event_at.tzinfo is None:
        event_at = event_at.replace(tzinfo=timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    age_seconds = (now_utc - event_at).total_seconds()
    if age_seconds < 0:
        return StaleStatus.FRESH  # Slight clock advance
    elif age_seconds < 300:
        return StaleStatus.FRESH
    elif age_seconds < 900:
        return StaleStatus.AGING
    elif age_seconds < 3600:
        return StaleStatus.STALE_WARNING
    return StaleStatus.FEED_OFFLINE


def validate_coordinates(lat: float, lon: float, heading: float, speed: float) -> tuple[bool, str | None]:
    """
    Strict coordinate & telemetry validity check:
    - No NaN/inf values
    - Latitude in [-90, 90]
    - Longitude in [-180, 180]
    - Heading in [0, 360)
    - Speed >= 0
    """
    for val, name in [(lat, "latitude"), (lon, "longitude"), (heading, "heading"), (speed, "speed")]:
        if math.isnan(val) or math.isinf(val):
            return False, f"Invalid {name}: NaN or Inf not permitted"

    if not (-90.0 <= lat <= 90.0):
        return False, f"Latitude {lat} out of range [-90, 90]"
    if not (-180.0 <= lon <= 180.0):
        return False, f"Longitude {lon} out of range [-180, 180]"
    if not (0.0 <= heading < 360.0):
        return False, f"Heading {heading} out of range [0, 360)"
    if speed < 0.0:
        return False, f"Speed {speed} cannot be negative"

    return True, None


def get_source_rank(source_type: DeviceType) -> int:
    """
    Source precedence:
    1. HARDWARE_OBD_CELLULAR
    2. EXTERNAL_GPS_GATEWAY
    3. MOBILE_APP_DRIVER
    4. LABELED_SIMULATOR_REPLAY
    """
    ranks = {
        DeviceType.HARDWARE_OBD_CELLULAR: 1,
        DeviceType.EXTERNAL_GPS_GATEWAY: 2,
        DeviceType.MOBILE_APP_DRIVER: 3,
        DeviceType.LABELED_SIMULATOR_REPLAY: 4,
    }
    return ranks.get(source_type, 99)


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates ground distance in meters between two coordinates."""
    r = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c
