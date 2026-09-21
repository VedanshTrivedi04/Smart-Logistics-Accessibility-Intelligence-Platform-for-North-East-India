"""
app/modules/incidents/infrastructure/repository.py — SQLAlchemy Implementation for Incidents.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.incidents.application.ports import IncidentRepositoryPort
from app.modules.incidents.domain.entities import (
    Incident,
    IncidentEdgeLink,
    IncidentMerge,
    OutboxEvent,
    ReviewDecision,
)
from app.modules.incidents.domain.enums import (
    AffectedDirection,
    IncidentLifecycle,
    OutboxStatus,
    ResolutionReason,
    ReviewDecisionKind,
)
from app.modules.incidents.domain.recalculation import ActiveIncidentCondition
from app.modules.incidents.infrastructure.models import (
    IncidentEdgeModel,
    IncidentMergeModel,
    IncidentModel,
    IncidentReportModel,
    OutboxEventModel,
    OutboxReceiptModel,
    ReviewDecisionModel,
)
from app.modules.reporting.domain.enums import RejectionReason, ReportSeverity


class SqlAlchemyIncidentRepository(IncidentRepositoryPort):
    """PostgreSQL storage adapter for incident lifecycle, verifier reviews, and outbox."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _to_domain(self, m: IncidentModel) -> Incident:
        return Incident(
            id=m.id,
            primary_report_id=m.primary_report_id,
            lifecycle=IncidentLifecycle(m.lifecycle),
            severity=ReportSeverity(m.severity),
            title=m.title,
            description=m.description,
            created_at=m.created_at,
            version=m.version,
            resolution_reason=ResolutionReason(m.resolution_reason) if m.resolution_reason else None,
            resolution_notes=m.resolution_notes,
            resolved_by=m.resolved_by,
            resolved_at=m.resolved_at,
            reopened_reason=m.reopened_reason,
            reopened_at=m.reopened_at,
            reopened_by=m.reopened_by,
        )

    async def create_incident(
        self,
        incident: Incident,
        primary_report_id: UUID,
        affected_edges: list[tuple[UUID, str, bool]] | None = None,
    ) -> Incident:
        m = IncidentModel(
            id=incident.id,
            primary_report_id=primary_report_id,
            lifecycle=incident.lifecycle.value,
            severity=incident.severity.value,
            title=incident.title,
            description=incident.description,
            created_at=incident.created_at,
            version=incident.version,
        )
        self.session.add(m)
        await self.session.flush()

        # Link primary report
        rep_link = IncidentReportModel(
            incident_id=incident.id,
            report_id=primary_report_id,
            is_primary=True,
            linked_at=datetime.now(timezone.utc),
        )
        self.session.add(rep_link)

        # Link affected edges
        if affected_edges:
            for edge_id, direction, is_full_closure in affected_edges:
                edge_link = IncidentEdgeModel(
                    incident_id=incident.id,
                    edge_id=edge_id,
                    affected_direction=direction,
                    is_full_closure=is_full_closure,
                    linked_at=datetime.now(timezone.utc),
                )
                self.session.add(edge_link)

        await self.session.flush()
        return incident

    async def get_incident_by_id(self, incident_id: UUID) -> Incident | None:
        stmt = (
            select(IncidentModel)
            .options(
                selectinload(IncidentModel.reports),
                selectinload(IncidentModel.affected_edges),
            )
            .where(IncidentModel.id == incident_id)
        )
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None
        return self._to_domain(m)

    async def update_incident(self, incident: Incident) -> Incident:
        stmt = select(IncidentModel).where(IncidentModel.id == incident.id).with_for_update()
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            raise ValueError(f"Incident {incident.id} not found")

        m.lifecycle = incident.lifecycle.value
        m.severity = incident.severity.value
        m.title = incident.title
        m.description = incident.description
        m.resolution_reason = incident.resolution_reason.value if incident.resolution_reason else None
        m.resolution_notes = incident.resolution_notes
        m.resolved_by = incident.resolved_by
        m.resolved_at = incident.resolved_at
        m.reopened_reason = incident.reopened_reason
        m.reopened_at = incident.reopened_at
        m.reopened_by = incident.reopened_by
        m.version = incident.version + 1
        await self.session.flush()

        incident.version = m.version
        return incident

    async def list_incidents(
        self,
        lifecycle: IncidentLifecycle | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Incident]:
        stmt = select(IncidentModel)
        if lifecycle:
            stmt = stmt.where(IncidentModel.lifecycle == lifecycle.value)
        stmt = stmt.order_by(IncidentModel.created_at.desc()).limit(limit).offset(offset)
        res = await self.session.execute(stmt)
        models = res.scalars().all()
        return [self._to_domain(m) for m in models]

    async def create_review_decision(self, decision: ReviewDecision) -> ReviewDecision:
        m = ReviewDecisionModel(
            id=decision.id,
            report_id=decision.report_id,
            reviewer_id=decision.reviewer_id,
            decision=decision.decision.value,
            notes=decision.notes,
            rejection_reason=decision.rejection_reason.value if decision.rejection_reason else None,
            incident_id=decision.incident_id,
            created_at=decision.created_at,
        )
        self.session.add(m)
        await self.session.flush()
        return decision

    async def get_review_decisions_for_report(self, report_id: UUID) -> list[ReviewDecision]:
        stmt = (
            select(ReviewDecisionModel)
            .where(ReviewDecisionModel.report_id == report_id)
            .order_by(ReviewDecisionModel.created_at.asc())
        )
        res = await self.session.execute(stmt)
        models = res.scalars().all()
        return [
            ReviewDecision(
                id=m.id,
                report_id=m.report_id,
                reviewer_id=m.reviewer_id,
                decision=ReviewDecisionKind(m.decision),
                notes=m.notes,
                rejection_reason=RejectionReason(m.rejection_reason) if m.rejection_reason else None,
                incident_id=m.incident_id,
                created_at=m.created_at,
            )
            for m in models
        ]

    async def record_incident_merge(self, merge: IncidentMerge) -> None:
        merge_m = IncidentMergeModel(
            id=merge.id,
            source_incident_id=merge.source_incident_id,
            target_incident_id=merge.target_incident_id,
            merged_by=merge.merged_by,
            notes=merge.notes,
            merged_at=merge.merged_at,
        )
        self.session.add(merge_m)

        # 1. Fetch source reports and link them to target if not already present
        src_rep_stmt = select(IncidentReportModel).where(IncidentReportModel.incident_id == merge.source_incident_id)
        src_reps = (await self.session.execute(src_rep_stmt)).scalars().all()
        for r in src_reps:
            existing = await self.session.get(IncidentReportModel, (merge.target_incident_id, r.report_id))
            if not existing:
                self.session.add(IncidentReportModel(
                    incident_id=merge.target_incident_id,
                    report_id=r.report_id,
                    is_primary=False,
                ))

        # 2. Fetch source edges and link them to target
        src_edge_stmt = select(IncidentEdgeModel).where(IncidentEdgeModel.incident_id == merge.source_incident_id)
        src_edges = (await self.session.execute(src_edge_stmt)).scalars().all()
        for e in src_edges:
            existing_edge = await self.session.get(IncidentEdgeModel, (merge.target_incident_id, e.edge_id))
            if not existing_edge:
                self.session.add(IncidentEdgeModel(
                    incident_id=merge.target_incident_id,
                    edge_id=e.edge_id,
                    affected_direction=e.affected_direction,
                    is_full_closure=e.is_full_closure,
                ))

        # 3. Transition source incident to RESOLVED with MERGED_INTO
        src_inc = await self.session.get(IncidentModel, merge.source_incident_id)
        if src_inc:
            src_inc.lifecycle = IncidentLifecycle.RESOLVED.value
            src_inc.resolution_reason = ResolutionReason.MERGED_INTO.value
            src_inc.resolution_notes = f"Merged into primary incident {merge.target_incident_id}"
            src_inc.resolved_by = merge.merged_by
            src_inc.resolved_at = merge.merged_at
            src_inc.version += 1

        await self.session.flush()

    async def get_active_incidents_for_edge(self, edge_id: UUID) -> list[ActiveIncidentCondition]:
        stmt = (
            select(IncidentModel.id, IncidentModel.severity, IncidentModel.lifecycle, IncidentEdgeModel.is_full_closure)
            .join(IncidentEdgeModel, IncidentModel.id == IncidentEdgeModel.incident_id)
            .where(
                IncidentEdgeModel.edge_id == edge_id,
                IncidentModel.lifecycle.in_([IncidentLifecycle.ACTIVE.value, IncidentLifecycle.MONITORING.value]),
            )
        )
        res = await self.session.execute(stmt)
        rows = res.all()
        return [
            ActiveIncidentCondition(
                incident_id=row[0],
                severity=ReportSeverity(row[1]),
                lifecycle=row[2],
                is_full_closure=row[3],
            )
            for row in rows
        ]

    async def create_outbox_event(self, event: OutboxEvent) -> OutboxEvent:
        m = OutboxEventModel(
            id=event.id,
            event_type=event.event_type,
            payload=event.payload,
            status=event.status.value,
            retry_count=event.retry_count,
            max_retries=event.max_retries,
            last_error=event.last_error,
            created_at=event.created_at,
        )
        self.session.add(m)
        await self.session.flush()
        return event

    async def get_pending_outbox_events(self, limit: int = 50) -> list[OutboxEvent]:
        stmt = (
            select(OutboxEventModel)
            .where(OutboxEventModel.status == OutboxStatus.PENDING.value)
            .order_by(OutboxEventModel.created_at.asc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        models = res.scalars().all()
        return [
            OutboxEvent(
                id=m.id,
                event_type=m.event_type,
                payload=m.payload,
                status=OutboxStatus(m.status),
                retry_count=m.retry_count,
                max_retries=m.max_retries,
                last_error=m.last_error,
                created_at=m.created_at,
                dispatched_at=m.dispatched_at,
                failed_at=m.failed_at,
            )
            for m in models
        ]

    async def mark_outbox_event_dispatched(self, event_id: UUID) -> None:
        stmt = (
            update(OutboxEventModel)
            .where(OutboxEventModel.id == event_id)
            .values(
                status=OutboxStatus.DISPATCHED.value,
                dispatched_at=datetime.now(timezone.utc),
            )
        )
        await self.session.execute(stmt)
        await self.session.flush()

    async def mark_outbox_event_failed(
        self,
        event_id: UUID,
        error: str,
        is_dead_letter: bool = False,
    ) -> None:
        status = OutboxStatus.DEAD_LETTER if is_dead_letter else OutboxStatus.PENDING
        stmt = (
            update(OutboxEventModel)
            .where(OutboxEventModel.id == event_id)
            .values(
                status=status.value,
                retry_count=OutboxEventModel.retry_count + 1,
                last_error=error,
                failed_at=datetime.now(timezone.utc) if is_dead_letter else None,
            )
        )
        await self.session.execute(stmt)
        await self.session.flush()

    async def record_consumer_receipt(self, consumer_id: str, event_id: UUID) -> bool:
        receipt = OutboxReceiptModel(consumer_id=consumer_id, event_id=event_id)
        self.session.add(receipt)
        try:
            await self.session.flush()
            return True
        except IntegrityError:
            return False
