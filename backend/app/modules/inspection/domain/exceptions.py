"""
app/modules/inspection/domain/exceptions.py — Domain Exceptions for Inspection Module.
"""

from __future__ import annotations


class InspectionDomainError(Exception):
    """Base exception for all inspection domain errors."""
    pass


class InspectionNotFoundError(InspectionDomainError):
    """Raised when an inspection cannot be found."""
    pass


class InspectionAssignmentError(InspectionDomainError):
    """Raised when an unauthorized actor attempts to act on an inspection outside their assignment."""
    pass


class InspectionStateError(InspectionDomainError):
    """Raised when an invalid state transition is attempted."""
    pass


class SelfInspectionForbiddenError(InspectionDomainError):
    """Raised when an inspector attempts to adjudicate their own submitted report."""
    pass


class InspectionValidationError(InspectionDomainError):
    """Raised when required inspection fields or measurements are missing or invalid."""
    pass
