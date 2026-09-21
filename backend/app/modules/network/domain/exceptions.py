"""
app/modules/network/domain/exceptions.py — Domain Exceptions for Network & GIS Module.
"""

from __future__ import annotations

from app.core.exceptions import AppError, NotFoundError, ValidationError


class NetworkDomainError(AppError):
    """Base exception for network domain errors."""
    default_code = "NETWORK_ERROR"
    default_status = 400


class EdgeNotFoundError(NotFoundError):
    """Raised when a specified road edge is not found."""
    default_code = "EDGE_NOT_FOUND"


class NodeNotFoundError(NotFoundError):
    """Raised when a specified road topological node is not found."""
    default_code = "NODE_NOT_FOUND"


class FacilityNotFoundError(NotFoundError):
    """Raised when an enrolled facility is not found."""
    default_code = "FACILITY_NOT_FOUND"


class BridgeNotFoundError(NotFoundError):
    """Raised when a structural bridge asset is not found."""
    default_code = "BRIDGE_NOT_FOUND"


class InvalidTopologyError(ValidationError):
    """Raised when road network graph topology contains illegal disconnections or orphan nodes."""
    default_code = "INVALID_TOPOLOGY"


class CoverageGapError(AppError):
    """Raised when a spatial query or route cannot be completed due to unmapped road coverage."""
    default_code = "COVERAGE_GAP"
    default_status = 422


class EdgeStatusImmutableError(AppError):
    """Raised when an illegal modification of append-only edge status history is attempted."""
    default_code = "EDGE_STATUS_IMMUTABLE"
    default_status = 409
