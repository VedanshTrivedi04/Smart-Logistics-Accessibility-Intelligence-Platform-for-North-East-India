"""
app/modules/coordination/domain/exceptions.py — Domain exceptions for coordination.
"""

from __future__ import annotations

from app.core.exceptions import NotFoundError, UnprocessableError


class InvalidCoordinationActionError(UnprocessableError):
    code = "INVALID_COORDINATION_ACTION"

    def __init__(self, message: str):
        super().__init__(message=message, code=self.code)


class CoordinationTargetNotFoundError(NotFoundError):
    code = "COORDINATION_TARGET_NOT_FOUND"

    def __init__(self, message: str):
        super().__init__(message=message, code=self.code)
