"""
app/modules/incidents/domain/__init__.py — Incidents Domain Package.
"""

from app.modules.incidents.domain.entities import (
    Incident,
    IncidentEdgeLink,
    IncidentMerge,
    IncidentReportLink,
    OutboxEvent,
    OutboxReceipt,
    ReviewDecision,
)
from app.modules.incidents.domain.enums import (
    AffectedDirection,
    IncidentLifecycle,
    OutboxStatus,
    ResolutionReason,
    ReviewDecisionKind,
)
from app.modules.incidents.domain.exceptions import (
    IncidentAlreadyResolvedError,
    IncidentNotFoundError,
    IncidentsDomainError,
    JurisdictionScopeError,
    MergeCycleError,
    ReopenIncidentReasonRequiredError,
    SelfVerificationForbiddenError,
    VersionConflictError,
)
from app.modules.incidents.domain.recalculation import (
    ActiveIncidentCondition,
    recalculate_effective_edge_status,
)

__all__ = [
    "Incident",
    "IncidentReportLink",
    "IncidentEdgeLink",
    "IncidentMerge",
    "ReviewDecision",
    "OutboxEvent",
    "OutboxReceipt",
    "IncidentLifecycle",
    "ReviewDecisionKind",
    "ResolutionReason",
    "OutboxStatus",
    "AffectedDirection",
    "IncidentsDomainError",
    "IncidentNotFoundError",
    "SelfVerificationForbiddenError",
    "JurisdictionScopeError",
    "VersionConflictError",
    "ReopenIncidentReasonRequiredError",
    "MergeCycleError",
    "IncidentAlreadyResolvedError",
    "ActiveIncidentCondition",
    "recalculate_effective_edge_status",
]
