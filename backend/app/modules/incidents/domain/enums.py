"""
app/modules/incidents/domain/enums.py — Domain Enums for Incidents Module.
"""

from __future__ import annotations

from enum import Enum


class IncidentLifecycle(str, Enum):
    """Operational lifecycle for confirmed incidents."""
    ACTIVE = "ACTIVE"
    MONITORING = "MONITORING"
    RESOLVED = "RESOLVED"


class ReviewDecisionKind(str, Enum):
    """Adjudication outcomes for field observations."""
    CONFIRM_INCIDENT = "CONFIRM_INCIDENT"
    REJECT_REPORT = "REJECT_REPORT"
    REQUEST_MORE_INFO = "REQUEST_MORE_INFO"


class ResolutionReason(str, Enum):
    """Enumerated justification for closing an operational incident."""
    REPAIRS_COMPLETED = "REPAIRS_COMPLETED"
    HAZARD_CLEARED = "HAZARD_CLEARED"
    MERGED_INTO = "MERGED_INTO"
    FALSE_ALARM = "FALSE_ALARM"
    EXPIRED = "EXPIRED"
    OTHER = "OTHER"


class OutboxStatus(str, Enum):
    """Lifecycle status for transactional outbox records."""
    PENDING = "PENDING"
    DISPATCHED = "DISPATCHED"
    DEAD_LETTER = "DEAD_LETTER"


class AffectedDirection(str, Enum):
    """Directional closure semantics on road segments."""
    BOTH = "BOTH"
    FORWARD = "FORWARD"
    BACKWARD = "BACKWARD"
