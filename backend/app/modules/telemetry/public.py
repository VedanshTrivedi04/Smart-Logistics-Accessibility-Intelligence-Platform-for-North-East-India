"""
app/modules/telemetry/public.py — Public module contract for Telemetry & Tracking.
"""

from __future__ import annotations

from app.modules.telemetry.application.ports import TelemetryRepositoryPort
from app.modules.telemetry.domain.entities import (
    BatchIngestResult,
    BreadcrumbPoint,
    Device,
    DeviceReplayLedger,
    FixResult,
    RawTelemetryFix,
    VehicleCurrentPosition,
    derive_stale_status,
    get_source_rank,
    haversine_distance_m,
    validate_coordinates,
)
from app.modules.telemetry.domain.enums import (
    DeviceStatus,
    DeviceType,
    FixOutcome,
    FixQuality,
    QuarantineReason,
    StaleStatus,
)
from app.modules.telemetry.domain.exceptions import (
    DeviceAuthenticationError,
    DeviceNotAssignedError,
    DeviceNotFoundError,
    DeviceRevokedError,
    DeviceSuspendedError,
    DeviceVehicleMismatchError,
    VehiclePositionNotFoundError,
)

__all__ = [
    "BatchIngestResult",
    "BreadcrumbPoint",
    "Device",
    "DeviceAuthenticationError",
    "DeviceNotAssignedError",
    "DeviceNotFoundError",
    "DeviceReplayLedger",
    "DeviceRevokedError",
    "DeviceStatus",
    "DeviceSuspendedError",
    "DeviceType",
    "DeviceVehicleMismatchError",
    "FixOutcome",
    "FixQuality",
    "FixResult",
    "QuarantineReason",
    "RawTelemetryFix",
    "StaleStatus",
    "TelemetryRepositoryPort",
    "VehicleCurrentPosition",
    "VehiclePositionNotFoundError",
    "derive_stale_status",
    "get_source_rank",
    "haversine_distance_m",
    "validate_coordinates",
]
