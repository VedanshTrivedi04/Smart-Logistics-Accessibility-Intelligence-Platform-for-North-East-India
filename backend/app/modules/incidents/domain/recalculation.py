"""
app/modules/incidents/domain/recalculation.py — Safe Road Edge Traversability Recalculation Engine.

Enforces Policies 7 & 8:
- When an incident is marked RESOLVED, the system NEVER simply marks the road edge OPEN.
- Recalculates effective status evaluating all remaining active incidents and restrictions.
- Severity Hierarchy: BLOCKED > RESTRICTED > PROVISIONAL_CAUTION > OPEN > UNKNOWN.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.modules.network.domain.enums import AccessibilityStatus
from app.modules.reporting.domain.enums import ReportSeverity


@dataclass(frozen=True)
class ActiveIncidentCondition:
    """Incident condition affecting a specific road edge."""
    incident_id: UUID
    severity: ReportSeverity
    is_full_closure: bool = True
    lifecycle: str = "ACTIVE"  # ACTIVE | MONITORING


def recalculate_effective_edge_status(
    edge_id: UUID,
    active_incidents: list[ActiveIncidentCondition],
    active_restrictions: list[str] | None = None,
    has_provisional_caution: bool = False,
) -> tuple[AccessibilityStatus, list[str]]:
    """
    Pure domain rule: Determine the combined effective accessibility status of an edge.
    
    Returns:
        (effective_status, combined_restrictions)
    """
    restrictions: list[str] = list(active_restrictions or [])
    
    # Filter only truly active/monitoring incidents
    open_incidents = [
        inc for inc in active_incidents
        if inc.lifecycle in {"ACTIVE", "MONITORING"}
    ]

    # Check for BLOCKED conditions
    # An edge is BLOCKED if any active incident has full closure or CRITICAL severity
    has_blocking_incident = any(
        inc.is_full_closure or inc.severity == ReportSeverity.CRITICAL
        for inc in open_incidents
    )
    if has_blocking_incident:
        for inc in open_incidents:
            if inc.is_full_closure or inc.severity == ReportSeverity.CRITICAL:
                restrictions.append(f"INCIDENT_CLOSURE:{inc.incident_id}:{inc.severity.value}")
        return AccessibilityStatus.BLOCKED, sorted(list(set(restrictions)))

    # Check for RESTRICTED conditions
    # Edge is RESTRICTED if partial closure, HIGH/MEDIUM severity incident, or physical edge restrictions
    has_restricted_incident = any(
        inc.severity in {ReportSeverity.HIGH, ReportSeverity.MEDIUM} or not inc.is_full_closure
        for inc in open_incidents
    )
    if has_restricted_incident or len(restrictions) > 0:
        for inc in open_incidents:
            restrictions.append(f"INCIDENT_RESTRICTION:{inc.incident_id}:{inc.severity.value}")
        return AccessibilityStatus.RESTRICTED, sorted(list(set(restrictions)))

    # Check for PROVISIONAL_CAUTION
    if has_provisional_caution:
        restrictions.append("ACTIVE_PROVISIONAL_CAUTION")
        return AccessibilityStatus.PROVISIONAL_CAUTION, sorted(list(set(restrictions)))

    # No blocking or restrictive conditions remain
    return AccessibilityStatus.OPEN, []
