"""
app/modules/identity/domain/exceptions.py — Domain-level exceptions for Identity.
"""

from __future__ import annotations


class IdentityDomainError(Exception):
    """Base domain exception for identity operations."""
    def __init__(self, message: str, code: str = "IDENTITY_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


class SessionNotFoundError(IdentityDomainError):
    def __init__(self, message: str = "Session not found") -> None:
        super().__init__(message, code="SESSION_NOT_FOUND")


class SessionExpiredError(IdentityDomainError):
    def __init__(self, message: str = "Session expired") -> None:
        super().__init__(message, code="SESSION_EXPIRED")


class SessionRevokedError(IdentityDomainError):
    def __init__(self, message: str = "Session revoked") -> None:
        super().__init__(message, code="SESSION_REVOKED")


class SessionIdleTimeoutError(IdentityDomainError):
    def __init__(self, message: str = "Session expired due to inactivity") -> None:
        super().__init__(message, code="SESSION_IDLE_TIMEOUT")


class MembershipInactiveError(IdentityDomainError):
    def __init__(self, message: str = "User membership is not active") -> None:
        super().__init__(message, code="MEMBERSHIP_INACTIVE")


class InvalidAuthStateError(IdentityDomainError):
    def __init__(self, message: str = "Invalid or expired OIDC state parameter") -> None:
        super().__init__(message, code="INVALID_AUTH_STATE")


class GrantAuthorityViolationError(IdentityDomainError):
    def __init__(self, message: str = "Grant exceeds grantor's authority") -> None:
        super().__init__(message, code="GRANT_AUTHORITY_DENIED")
