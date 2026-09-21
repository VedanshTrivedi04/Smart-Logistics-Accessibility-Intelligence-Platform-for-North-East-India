"""
app/modules/telemetry/domain/exceptions.py — Domain exceptions for Telemetry.
"""

from __future__ import annotations

from app.core.exceptions import (
    AuthenticationError,
    ForbiddenError,
    NotFoundError,
)


class DeviceAuthenticationError(AuthenticationError):
    code = "DEVICE_AUTHENTICATION_FAILED"

    def __init__(self, message: str = "Invalid device authentication token"):
        super().__init__(message=message, code=self.code)


class DeviceSuspendedError(ForbiddenError):
    code = "DEVICE_SUSPENDED"

    def __init__(self, message: str = "Device is suspended"):
        super().__init__(message=message, code=self.code)


class DeviceRevokedError(ForbiddenError):
    code = "DEVICE_REVOKED"

    def __init__(self, message: str = "Device has been revoked"):
        super().__init__(message=message, code=self.code)


class DeviceNotAssignedError(ForbiddenError):
    code = "DEVICE_NOT_ASSIGNED"

    def __init__(self, message: str = "Device is not currently assigned to any vehicle"):
        super().__init__(message=message, code=self.code)


class DeviceVehicleMismatchError(ForbiddenError):
    code = "DEVICE_VEHICLE_MISMATCH"

    def __init__(self, message: str = "Device is assigned to a different vehicle"):
        super().__init__(message=message, code=self.code)


class VehiclePositionNotFoundError(NotFoundError):
    code = "VEHICLE_POSITION_NOT_FOUND"

    def __init__(self, message: str = "No current position found for vehicle"):
        super().__init__(message=message, code=self.code)


class DeviceNotFoundError(NotFoundError):
    code = "DEVICE_NOT_FOUND"

    def __init__(self, message: str = "Device not found"):
        super().__init__(message=message, code=self.code)
