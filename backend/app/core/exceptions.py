"""
app/core/exceptions.py — Typed HTTP exception hierarchy.

All domain errors inherit from AppError.
FastAPI exception handlers map these to correct HTTP responses.

Error response shape (always):
    {
        "code": "SNAKE_CASE_ERROR_CODE",
        "message": "Human-readable message",
        "request_id": "uuid",
        "details": {}  // optional structured details
    }
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import ORJSONResponse
from starlette.status import (
    HTTP_400_BAD_REQUEST,
    HTTP_401_UNAUTHORIZED,
    HTTP_403_FORBIDDEN,
    HTTP_404_NOT_FOUND,
    HTTP_409_CONFLICT,
    HTTP_412_PRECONDITION_FAILED,
    HTTP_429_TOO_MANY_REQUESTS,
    HTTP_500_INTERNAL_SERVER_ERROR,
)

HTTP_422_UNPROCESSABLE_ENTITY = 422



# ──────────────────────────────────────────────────────────────
# Base exception
# ──────────────────────────────────────────────────────────────

class AppError(Exception):
    """
    Base class for all application exceptions.

    All domain errors should raise a subclass of AppError so
    that the exception handler can return a correctly structured response.
    """

    http_status: int = HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "INTERNAL_ERROR"

    def __init__(
        self,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}
        if code:
            self.code = code


# ──────────────────────────────────────────────────────────────
# 4xx Exceptions
# ──────────────────────────────────────────────────────────────

class ValidationError(AppError):
    """400 — Request payload failed domain validation (not Pydantic schema)."""
    http_status = HTTP_400_BAD_REQUEST
    code = "VALIDATION_ERROR"


class AuthenticationError(AppError):
    """
    401 — No valid session / token expired.

    Use this when the request has NO valid identity.
    Never leak whether a resource exists or not in this error.
    """
    http_status = HTTP_401_UNAUTHORIZED
    code = "AUTHENTICATION_REQUIRED"


class ForbiddenError(AppError):
    """
    403 — Authenticated but not authorized for this action.

    Use ONLY when the resource's existence is not sensitive
    (e.g., trying to DELETE something you can read but not delete).

    If the resource's existence itself is sensitive (another org's data),
    raise NotFoundError instead (Policy 4: 404-vs-403).
    """
    http_status = HTTP_403_FORBIDDEN
    code = "FORBIDDEN"


class CSRFValidationError(ForbiddenError):
    """403 — CSRF token missing, expired, or invalid."""
    code = "CSRF_VALIDATION_FAILED"


class OriginForbiddenError(ForbiddenError):
    """403 — Origin header not permitted."""
    code = "ORIGIN_FORBIDDEN"


class NoActiveMembershipError(ForbiddenError):
    """403 — User has no active organization memberships."""
    code = "NO_ACTIVE_MEMBERSHIP"


class GrantAuthorityError(ForbiddenError):
    """403 — Principal cannot grant capability or jurisdiction they do not possess."""
    code = "GRANT_AUTHORITY_DENIED"



class NotFoundError(AppError):
    """
    404 — Resource not found OR resource exists but user has no visibility.

    This is a deliberate security choice (Policy 4):
    - Resource does not exist → 404
    - Resource exists but caller has no access → 404 (hides existence)

    Never use 403 when the existence of the resource is itself sensitive
    (e.g., another organization's data).
    """
    http_status = HTTP_404_NOT_FOUND
    code = "NOT_FOUND"


class ConflictError(AppError):
    """
    409 — Business rule conflict.

    Examples:
    - Duplicate idempotency key with different body
    - Stale route plan (version mismatch at dispatch time)
    - Illegal state transition
    """
    http_status = HTTP_409_CONFLICT
    code = "CONFLICT"


class StaleRouteError(ConflictError):
    """409 — Dispatch rejected because route plan version is stale."""
    code = "STALE_ROUTE_PLAN"


class IdempotencyConflictError(ConflictError):
    """409 — Same idempotency key submitted with different request body."""
    code = "IDEMPOTENCY_CONFLICT"


class StaleVersionError(AppError):
    """
    412 Precondition Failed — Optimistic concurrency failure.

    Returned when If-Match version header does not match current DB version.
    Examples: concurrent review decisions, concurrent vehicle assignments.
    """
    http_status = HTTP_412_PRECONDITION_FAILED
    code = "STALE_VERSION"


class UnprocessableError(AppError):
    """422 — Semantically invalid request (passes schema but fails domain rules)."""
    http_status = HTTP_422_UNPROCESSABLE_ENTITY
    code = "UNPROCESSABLE"


class RateLimitError(AppError):
    """429 — Too many requests."""
    http_status = HTTP_429_TOO_MANY_REQUESTS
    code = "RATE_LIMITED"


# ──────────────────────────────────────────────────────────────
# FastAPI exception handlers
# ──────────────────────────────────────────────────────────────

def _get_request_id(request: Request) -> str:
    """Extract request_id set by RequestIDMiddleware."""
    return str(request.state.request_id) if hasattr(request.state, "request_id") else "unknown"


async def app_error_handler(request: Request, exc: AppError) -> ORJSONResponse:
    """Handle all AppError subclasses with a structured JSON response."""
    return ORJSONResponse(
        status_code=exc.http_status,
        content={
            "code": exc.code,
            "message": exc.message,
            "request_id": _get_request_id(request),
            "details": exc.details,
        },
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> ORJSONResponse:
    """
    Catch-all handler for unhandled exceptions.

    In production: log the error, return a generic 500 (no stack trace).
    In development: include a brief description.
    """
    from app.core.config import get_settings
    from app.core.logging import get_logger

    logger = get_logger(__name__)
    logger.exception("unhandled_error", exc_info=exc, path=request.url.path)

    detail = str(exc) if get_settings().APP_ENV == "development" else None

    return ORJSONResponse(
        status_code=HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred.",
            "request_id": _get_request_id(request),
            "details": {"debug": detail} if detail else {},
        },
    )
