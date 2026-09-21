"""
app/modules/incidents/domain/entities.py — Domain Entities and Value Objects for Incidents Module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.modules.incidents.domain.enums import (
    AffectedDirection,
    IncidentLifecycle,
    OutboxStatus,
    ResolutionReason,
    ReviewDecisionKind,
)
from app.modules.incidents.domain.exceptions import (
    MergeCycleError,
    ReopenIncidentReasonRequiredError,
    SelfVerificationForbiddenError,
)
from app.modules.reporting.domain.enums import RejectionReason, ReportSeverity


@dataclass
class Incident:
    """Adjudicated operational incident affecting infrastructure in North-East India."""
    id: UUID
    primary_report_id: UUID
    lifecycle: IncidentLifecycle
    severity: ReportSeverity
    title: str
    description: str
    created_at: datetime
    version: int = 1
    resolution_reason: ResolutionReason | None = None
    resolution_notes: str | None = None
    resolved_by: UUID | None = None
    resolved_at: datetime | None = None
    reopened_reason: str | None = None
    reopened_at: datetime | None = None
    reopened_by: UUID | None = None

    def resolve(
        self,
        resolver_id: UUID,
        reason: ResolutionReason,
        notes: str | None = None,
        resolved_at: datetime | None = None,
    ) -> None:
        """Mark incident as resolved with documented audit rationale."""
        self.lifecycle = IncidentLifecycle.RESOLVED
        self.resolution_reason = reason
        self.resolution_notes = notes
        self.resolved_by = resolver_id
        self.resolved_at = resolved_at or datetime.now(timezone.utc)
        self.version += 1

    def reopen(
        self,
        reopener_id: UUID,
        reason: str,
        reopened_at: datetime | None = None,
    ) -> None:
        """Reopen a resolved incident with mandatory explanation."""
        if not reason or not reason.strip():
            raise ReopenIncidentReasonRequiredError(
                "A documented reason is strictly required to reopen a resolved incident."
            )
        self.lifecycle = IncidentLifecycle.ACTIVE
        self.reopened_reason = reason.strip()
        self.reopened_by = reopener_id
        self.reopened_at = reopened_at or datetime.now(timezone.utc)
        self.version += 1


@dataclass(frozen=True)
class ReviewDecision:
    """Immutable record of an authorized verifier's adjudication."""
    id: UUID
    report_id: UUID
    reviewer_id: UUID
    decision: ReviewDecisionKind
    notes: str | None = None
    rejection_reason: RejectionReason | None = None
    incident_id: UUID | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def validate_anti_self_verification(self, reporter_id: UUID) -> None:
        """Enforce strict anti-self-verification rule."""
        if self.reviewer_id == reporter_id:
            raise SelfVerificationForbiddenError(
                f"User {self.reviewer_id} cannot review report {self.report_id} "
                "because they are the original reporter."
            )


@dataclass(frozen=True)
class IncidentReportLink:
    """Associates an observation to an adjudicated incident."""
    incident_id: UUID
    report_id: UUID
    is_primary: bool
    linked_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(frozen=True)
class IncidentEdgeLink:
    """Operational road edge affected by an incident."""
    incident_id: UUID
    edge_id: UUID
    affected_direction: AffectedDirection = AffectedDirection.BOTH
    is_full_closure: bool = True
    linked_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(frozen=True)
class IncidentMerge:
    """Audit record when an incident is merged into another."""
    id: UUID
    source_incident_id: UUID
    target_incident_id: UUID
    merged_by: UUID
    notes: str | None = None
    merged_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def validate(self) -> None:
        if self.source_incident_id == self.target_incident_id:
            raise MergeCycleError("Cannot merge an incident into itself.")


@dataclass
class OutboxEvent:
    """Transactional outbox event to guarantee reliable cross-module event propagation."""
    id: UUID
    event_type: str
    payload: dict[str, Any]
    status: OutboxStatus = OutboxStatus.PENDING
    retry_count: int = 0
    max_retries: int = 5
    last_error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    dispatched_at: datetime | None = None
    failed_at: datetime | None = None


@dataclass(frozen=True)
class OutboxReceipt:
    """Receipt proving idempotent downstream consumption of an outbox event."""
    consumer_id: str
    event_id: UUID
    processed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
