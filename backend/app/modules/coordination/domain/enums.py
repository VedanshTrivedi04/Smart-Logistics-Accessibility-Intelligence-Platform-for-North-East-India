"""
app/modules/coordination/domain/enums.py — Enums for coordination actions.
"""

from __future__ import annotations

from enum import Enum


class SubjectType(str, Enum):
    """What a coordination action is about."""
    INCIDENT = "INCIDENT"
    ALERT = "ALERT"
    FACILITY = "FACILITY"
    TRIP = "TRIP"


class ActionType(str, Enum):
    ACKNOWLEDGE = "ACKNOWLEDGE"
    ESCALATE = "ESCALATE"
    ASSIGN = "ASSIGN"
    REQUEST_INSPECTION = "REQUEST_INSPECTION"
    INSPECTION_COMPLETE = "INSPECTION_COMPLETE"
    NOTE = "NOTE"


class InspectionStatus(str, Enum):
    NOT_REQUESTED = "NOT_REQUESTED"
    REQUESTED = "REQUESTED"
    COMPLETED = "COMPLETED"
