"""
tests/unit/test_exceptions.py — Unit tests for the exception hierarchy.

Tests:
- Each exception has the correct HTTP status code
- Error shape matches the standard envelope
- NotFoundError documents the 404-vs-403 security policy
- AppError subclasses are distinguishable by their code attribute
"""

from __future__ import annotations

import pytest
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


from app.core.exceptions import (
    AppError,
    AuthenticationError,
    ConflictError,
    ForbiddenError,
    IdempotencyConflictError,
    NotFoundError,
    RateLimitError,
    StaleRouteError,
    StaleVersionError,
    UnprocessableError,
    ValidationError,
)


class TestExceptionHttpStatus:
    """Each exception maps to the correct HTTP status code."""

    def test_app_error_default_is_500(self) -> None:
        exc = AppError("internal")
        assert exc.http_status == HTTP_500_INTERNAL_SERVER_ERROR

    def test_validation_error_is_400(self) -> None:
        assert ValidationError("bad").http_status == HTTP_400_BAD_REQUEST

    def test_authentication_error_is_401(self) -> None:
        assert AuthenticationError("unauth").http_status == HTTP_401_UNAUTHORIZED

    def test_forbidden_error_is_403(self) -> None:
        assert ForbiddenError("forbidden").http_status == HTTP_403_FORBIDDEN

    def test_not_found_error_is_404(self) -> None:
        assert NotFoundError("not found").http_status == HTTP_404_NOT_FOUND

    def test_conflict_error_is_409(self) -> None:
        assert ConflictError("conflict").http_status == HTTP_409_CONFLICT

    def test_stale_route_error_is_409(self) -> None:
        assert StaleRouteError("stale route").http_status == HTTP_409_CONFLICT

    def test_idempotency_conflict_is_409(self) -> None:
        assert IdempotencyConflictError("dup key").http_status == HTTP_409_CONFLICT

    def test_stale_version_error_is_412(self) -> None:
        assert StaleVersionError("412").http_status == HTTP_412_PRECONDITION_FAILED

    def test_unprocessable_error_is_422(self) -> None:
        assert UnprocessableError("422").http_status == HTTP_422_UNPROCESSABLE_ENTITY

    def test_rate_limit_error_is_429(self) -> None:
        assert RateLimitError("too many").http_status == HTTP_429_TOO_MANY_REQUESTS


class TestExceptionCodes:
    """Each exception has a distinct, snake_case error code."""

    def test_each_subclass_has_unique_code(self) -> None:
        codes = [
            AppError.code,
            ValidationError.code,
            AuthenticationError.code,
            ForbiddenError.code,
            NotFoundError.code,
            ConflictError.code,
            StaleRouteError.code,
            IdempotencyConflictError.code,
            StaleVersionError.code,
            UnprocessableError.code,
            RateLimitError.code,
        ]
        assert len(codes) == len(set(codes)), "Duplicate error codes found"

    def test_codes_are_snake_case(self) -> None:
        for exc_class in [ValidationError, AuthenticationError, ForbiddenError,
                          NotFoundError, ConflictError, StaleVersionError]:
            code = exc_class.code
            assert code == code.upper(), f"Code '{code}' should be UPPER_SNAKE_CASE"
            assert " " not in code, f"Code '{code}' should not contain spaces"


class TestExceptionDetails:
    """Exception details and message are correctly stored."""

    def test_message_stored(self) -> None:
        exc = NotFoundError("Resource xyz not found")
        assert exc.message == "Resource xyz not found"
        assert str(exc) == "Resource xyz not found"

    def test_details_stored(self) -> None:
        exc = StaleVersionError("Version mismatch", details={"current": 5, "submitted": 3})
        assert exc.details == {"current": 5, "submitted": 3}

    def test_details_default_empty_dict(self) -> None:
        exc = AppError("error")
        assert exc.details == {}

    def test_custom_code_override(self) -> None:
        exc = AppError("error", code="CUSTOM_CODE")
        assert exc.code == "CUSTOM_CODE"


class TestSecurityPolicy:
    """
    Documents and tests the 404-vs-403 security policy (Policy 4).

    This test class serves as executable documentation of the decision.
    """

    def test_not_found_used_for_missing_resources(self) -> None:
        """Standard 404: resource genuinely does not exist."""
        exc = NotFoundError("Report 123 not found")
        assert exc.http_status == HTTP_404_NOT_FOUND

    def test_not_found_used_when_resource_exists_but_no_visibility(self) -> None:
        """
        Security policy: return 404 (not 403) when a resource exists
        but the caller has no visibility into it.

        This prevents cross-org resource enumeration via error code differences.
        """
        # Simulates: Org A user guessed Org B's vehicle ID
        exc = NotFoundError("Vehicle not found")  # not "Forbidden"
        assert exc.http_status == HTTP_404_NOT_FOUND
        assert exc.http_status != HTTP_403_FORBIDDEN

    def test_forbidden_used_when_action_not_permitted_on_visible_resource(self) -> None:
        """
        403 is appropriate when the resource is visible but the action is not allowed.
        Example: trying to DELETE a report you can READ.
        """
        exc = ForbiddenError("You cannot delete a verified report")
        assert exc.http_status == HTTP_403_FORBIDDEN
