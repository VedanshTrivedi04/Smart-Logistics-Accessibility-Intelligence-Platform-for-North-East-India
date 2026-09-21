"""
app/modules/telemetry/application/ports.py — Application repository ports for Telemetry.
"""

from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

from app.modules.telemetry.domain.entities import (
    BreadcrumbPoint,
    Device,
    DeviceReplayLedger,
    VehicleCurrentPosition,
)


class TelemetryRepositoryPort(Protocol):
    """Abstract port for Telemetry storage & concurrency locks."""

    async def get_device_by_token_hash(self, token_hash: str) -> Device | None:
        ...

    async def get_device_by_id(self, device_id: UUID) -> Device | None:
        ...

    async def get_device_by_code(self, device_code: str) -> Device | None:
        ...

    async def save_device(self, device: Device) -> Device:
        ...

    async def update_device_last_seen(self, device_id: UUID, last_seen_at: datetime) -> None:
        ...

    async def get_replay_ledger(self, device_id: UUID, for_update: bool = False) -> DeviceReplayLedger | None:
        ...

    async def save_replay_ledger(self, ledger: DeviceReplayLedger) -> None:
        ...

    async def get_current_position(self, vehicle_id: UUID, for_update: bool = False) -> VehicleCurrentPosition | None:
        ...

    async def upsert_current_position(self, position: VehicleCurrentPosition) -> None:
        ...

    async def save_breadcrumbs(self, breadcrumbs: list[BreadcrumbPoint]) -> None:
        ...

    async def list_breadcrumbs(
        self,
        vehicle_id: UUID,
        start_time: datetime,
        end_time: datetime,
    ) -> list[BreadcrumbPoint]:
        ...

    async def get_active_trip_for_vehicle(self, vehicle_id: UUID) -> UUID | None:
        ...

    async def check_and_update_stop_geofence(
        self,
        trip_id: UUID,
        current_lat: float,
        current_lon: float,
        arrival_time: datetime,
    ) -> UUID | None:
        """Returns stop_id if vehicle arrived at a pending stop within 150m, else None."""
        ...
