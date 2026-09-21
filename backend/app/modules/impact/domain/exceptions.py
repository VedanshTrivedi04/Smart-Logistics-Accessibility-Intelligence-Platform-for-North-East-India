"""
app/modules/impact/domain/exceptions.py — Domain Exceptions for Impact Module.
"""

from __future__ import annotations

from app.core.exceptions import NotFoundError, UnprocessableError


class ImpactEvaluationError(UnprocessableError):
    code = "IMPACT_EVALUATION_ERROR"

    def __init__(self, message: str = "Error calculating disruption impact"):
        super().__init__(message=message, code=self.code)


class TripImpactNotFoundError(NotFoundError):
    code = "TRIP_IMPACT_NOT_FOUND"

    def __init__(self, message: str = "No impact assessment found for trip"):
        super().__init__(message=message, code=self.code)
