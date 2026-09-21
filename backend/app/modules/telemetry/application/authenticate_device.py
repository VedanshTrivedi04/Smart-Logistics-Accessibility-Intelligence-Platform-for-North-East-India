"""
app/modules/telemetry/application/authenticate_device.py — Authenticate telemetry device via token.
"""

from __future__ import annotations

import hashlib

from app.modules.telemetry.application.ports import TelemetryRepositoryPort
from app.modules.telemetry.domain.entities import Device
from app.modules.telemetry.domain.enums import DeviceStatus
from app.modules.telemetry.domain.exceptions import (
    DeviceAuthenticationError,
    DeviceRevokedError,
    DeviceSuspendedError,
)


class AuthenticateDeviceUseCase:
    def __init__(self, repository: TelemetryRepositoryPort):
        self.repository = repository

    async def execute(self, raw_token: str) -> Device:
        if not raw_token or not raw_token.strip():
            raise DeviceAuthenticationError("Missing device token")

        token_hash = hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()
        device = await self.repository.get_device_by_token_hash(token_hash)
        if device is None:
            raise DeviceAuthenticationError("Invalid device credentials")

        if device.status == DeviceStatus.SUSPENDED:
            raise DeviceSuspendedError(f"Device '{device.device_code}' is currently suspended")
        elif device.status == DeviceStatus.REVOKED:
            raise DeviceRevokedError(f"Device '{device.device_code}' has been permanently revoked")

        return device
