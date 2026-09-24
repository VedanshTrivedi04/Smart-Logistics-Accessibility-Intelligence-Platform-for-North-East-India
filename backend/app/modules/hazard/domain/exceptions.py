"""
app/modules/hazard/domain/exceptions.py — Domain Exceptions for Landslide Risk & Rainfall Hazard Module.
"""

from __future__ import annotations

from app.core.exceptions import AppError, NotFoundError


class HazardDomainError(AppError):
    """Base exception for hazard domain errors."""
    http_status = 400
    code = "HAZARD_ERROR"


class RiskZoneNotFoundError(NotFoundError):
    """Raised when a specified landslide risk zone is not found."""
    code = "RISK_ZONE_NOT_FOUND"
