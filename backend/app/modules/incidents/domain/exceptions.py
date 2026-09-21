"""
app/modules/incidents/domain/exceptions.py — Domain Exceptions for Incidents Module.
"""

from __future__ import annotations

from app.core.exceptions import (
    AppError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    StaleVersionError,
    ValidationError,
)


class IncidentsDomainError(AppError):
    """Base exception for incidents domain errors."""
    code = "INCIDENTS_ERROR"
    http_status = 400


class IncidentNotFoundError(NotFoundError):
    """Raised when an incident is not found."""
    code = "INCIDENT_NOT_FOUND"


class SelfVerificationForbiddenError(ForbiddenError):
    """
    Policy: Strict Anti-Self-Verification.
    A reporter cannot review, verify, or reject their own field report under any circumstances.
    """
    code = "SELF_VERIFICATION_FORBIDDEN"

    def __init__(self, message: str = "A reporter cannot verify or review their own field observation.") -> None:
        super().__init__(message, code=self.code)


class JurisdictionScopeError(ForbiddenError):
    """Raised when a verifier attempts to adjudicate outside their assigned jurisdiction."""
    code = "JURISDICTION_OUT_OF_SCOPE"


class VersionConflictError(StaleVersionError):
    """Raised when an If-Match version precondition fails (optimistic concurrency)."""
    code = "VERSION_CONFLICT"


class ReopenIncidentReasonRequiredError(ValidationError):
    """Raised when an attempt to reopen a resolved incident lacks a documented reason."""
    code = "REOPEN_REASON_REQUIRED"


class MergeCycleError(ValidationError):
    """Raised when attempting to merge an incident into itself or create a circular merge."""
    code = "CANNOT_MERGE_INTO_SELF"


class IncidentAlreadyResolvedError(ConflictError):
    """Raised when attempting an invalid action on an already resolved incident."""
    code = "INCIDENT_ALREADY_RESOLVED"
