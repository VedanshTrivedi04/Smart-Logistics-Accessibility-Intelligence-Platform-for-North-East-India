"""
app/modules/reporting/domain/exceptions.py — Domain Exceptions for Field Reporting Module.
"""

from __future__ import annotations

from app.core.exceptions import (
    AppError,
    ConflictError,
    NotFoundError,
    ValidationError,
)


class ReportingDomainError(AppError):
    """Base exception for reporting domain errors."""
    code = "REPORTING_ERROR"
    http_status = 400


class ReportNotFoundError(NotFoundError):
    """Raised when a specified field report does not exist."""
    code = "REPORT_NOT_FOUND"


class DuplicateOperationError(ConflictError):
    """Raised when an idempotency key collides across actors or has conflicting payloads."""
    code = "IDEMPOTENCY_PAYLOAD_MISMATCH"


class ReportAlreadyAdjudicatedError(ConflictError):
    """Raised when an offline edit/amendment attempts to alter a terminal report (VERIFIED or REJECTED)."""
    code = "REPORT_ALREADY_ADJUDICATED"


class StaleObservationError(ValidationError):
    """Raised when an observation timestamp is excessively stale (> 7 days)."""
    code = "STALE_OBSERVATION"


class ClockSkewError(ValidationError):
    """Raised when an observation timestamp is anomalously in the future."""
    code = "CLOCK_SKEW_ANOMALY"


class MediaValidationError(ValidationError):
    """Raised when media violates size, dimension, or MIME whitelist constraints."""
    code = "MEDIA_VALIDATION_ERROR"


class MediaNotFoundError(NotFoundError):
    """Raised when a media record is not found."""
    code = "MEDIA_NOT_FOUND"


class MediaScanNotCleanError(ConflictError):
    """Raised when attempting to attach a media file that has not passed quarantine scan."""
    code = "MEDIA_SCAN_PENDING_OR_REJECTED"


class BatchSizeExceededError(ValidationError):
    """Raised when a sync batch contains more than the maximum permitted items."""
    code = "BATCH_SIZE_EXCEEDED"


class MediaStorageUnavailableError(AppError):
    """The uploaded file could not be read back from storage yet. The client should retry."""
    http_status = 503
    code = "MEDIA_STORAGE_UNAVAILABLE"
