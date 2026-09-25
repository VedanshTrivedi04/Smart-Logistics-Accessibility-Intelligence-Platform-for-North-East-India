"""
app/modules/incidents/api/router.py — FastAPI Router for Incident Adjudication and Lifecycle.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status
from app.core.db import DbSession as AsyncSession, get_db
from app.core.security import (
    PrincipalContext,
    require_authenticated,
    require_capability,
)
from app.modules.identity.domain.enums import Capability
from app.modules.incidents.api.schemas import (
    IncidentResponse,
    MergeIncidentsRequest,
    ResolveIncidentRequest,
    ReviewDecisionRequest,
    ReviewDecisionResponse,
)
from app.modules.incidents.application.merge_incidents import MergeIncidentsUseCase
from app.modules.incidents.application.resolve_incident import ResolveIncidentUseCase
from app.modules.incidents.application.triage_report import TriageReportUseCase
from app.modules.incidents.application.verify_report import VerifyReportUseCase
from app.modules.incidents.domain.entities import Incident
from app.modules.incidents.domain.enums import IncidentLifecycle
from app.modules.incidents.domain.exceptions import IncidentNotFoundError
from app.modules.incidents.infrastructure.repository import SqlAlchemyIncidentRepository
from app.modules.network.application.declare_edge_status import DeclareEdgeStatusUseCase
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository
from app.modules.reporting.api.router import _to_response_dto
from app.modules.reporting.api.schemas import ReportResponse
from app.modules.reporting.infrastructure.repository import SqlAlchemyReportingRepository

router = APIRouter(tags=["Incident Adjudication & Road Traversability Lifecycle"])


def _to_incident_dto(i: Incident) -> IncidentResponse:
    return IncidentResponse(
        id=i.id,
        primary_report_id=i.primary_report_id,
        lifecycle=i.lifecycle.value,
        severity=i.severity.value,
        title=i.title,
        description=i.description,
        resolution_reason=i.resolution_reason.value if i.resolution_reason else None,
        resolution_notes=i.resolution_notes,
        resolved_by=i.resolved_by,
        resolved_at=i.resolved_at,
        reopened_reason=i.reopened_reason,
        reopened_at=i.reopened_at,
        created_at=i.created_at,
        version=i.version,
    )


# ─────────────────────────────────────────────────────────────────
# 1. Report Triage & Adjudication
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/reports/{report_id}/triage",
    summary="Claim observation for review (transitions to UNDER_REVIEW)",
    response_model=ReportResponse,
)
async def triage_report(
    report_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.VERIFY_REPORT)),
) -> ReportResponse:
    reporting_repo = SqlAlchemyReportingRepository(db)
    use_case = TriageReportUseCase(reporting_repo)
    report = await use_case.execute(principal=principal, report_id=report_id)
    # Handlers own the transaction: get_db() does not commit, so without this the write is rolled back.
    await db.commit()
    return _to_response_dto(report)


@router.post(
    "/reports/{report_id}/review",
    summary="Adjudicate field observation (Atomic 7-way verification or rejection)",
    response_model=ReviewDecisionResponse,
)
async def review_report(
    report_id: UUID,
    req: ReviewDecisionRequest,
    if_match: str | None = Header(None, alias="If-Match"),
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.VERIFY_REPORT)),
) -> ReviewDecisionResponse:
    reporting_repo = SqlAlchemyReportingRepository(db)
    incident_repo = SqlAlchemyIncidentRepository(db)
    network_repo = SqlAlchemyNetworkRepository(db)
    declare_use_case = DeclareEdgeStatusUseCase(network_repo, network_repo)

    verify_use_case = VerifyReportUseCase(
        reporting_repo=reporting_repo,
        incident_repo=incident_repo,
        declare_status_use_case=declare_use_case,
    )

    if_match_ver: int | None = None
    if if_match:
        try:
            if_match_ver = int(if_match.strip('"'))
        except ValueError:
            pass

    edges = [
        (e.edge_id, e.affected_direction, e.is_full_closure)
        for e in req.affected_edges
    ]

    result = await verify_use_case.execute(
        principal=principal,
        report_id=report_id,
        decision=req.decision,
        notes=req.notes,
        rejection_reason=req.rejection_reason,
        existing_incident_id=req.existing_incident_id,
        affected_edges=edges,
        incident_title=req.incident_title,
        if_match_version=if_match_ver,
    )
    # Handlers own the transaction: get_db() does not commit, so without this the write is rolled back.
    await db.commit()

    return ReviewDecisionResponse(
        report_id=UUID(result["report_id"]),
        review_state=result["review_state"],
        version=result["version"],
        incident_id=UUID(result["incident_id"]) if result["incident_id"] else None,
        decision=result["decision"],
    )


# ─────────────────────────────────────────────────────────────────
# 2. Incident Lifecycle Operations
# ─────────────────────────────────────────────────────────────────
@router.get(
    "/incidents",
    summary="List operational incidents",
    response_model=list[IncidentResponse],
)
async def list_incidents(
    lifecycle: IncidentLifecycle | None = Query(None, description="Filter by operational lifecycle"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> list[IncidentResponse]:
    repo = SqlAlchemyIncidentRepository(db)
    incidents = await repo.list_incidents(lifecycle=lifecycle, limit=limit, offset=offset)
    return [_to_incident_dto(i) for i in incidents]


@router.get(
    "/incidents/{incident_id}",
    summary="Get operational incident detail",
    response_model=IncidentResponse,
)
async def get_incident(
    incident_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> IncidentResponse:
    repo = SqlAlchemyIncidentRepository(db)
    incident = await repo.get_incident_by_id(incident_id)
    if not incident:
        raise IncidentNotFoundError(f"Incident {incident_id} not found.")
    return _to_incident_dto(incident)


@router.post(
    "/incidents/{incident_id}/resolve",
    summary="Resolve incident and safely recalculate road edge traversability",
    response_model=IncidentResponse,
)
async def resolve_incident(
    incident_id: UUID,
    req: ResolveIncidentRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.VERIFY_REPORT)),
) -> IncidentResponse:
    incident_repo = SqlAlchemyIncidentRepository(db)
    network_repo = SqlAlchemyNetworkRepository(db)
    declare_use_case = DeclareEdgeStatusUseCase(network_repo, network_repo)

    use_case = ResolveIncidentUseCase(
        incident_repo=incident_repo,
        declare_status_use_case=declare_use_case,
    )

    resolved = await use_case.execute(
        principal=principal,
        incident_id=incident_id,
        reason=req.reason,
        notes=req.notes,
        affected_edge_ids=req.affected_edge_ids,
    )
    # Handlers own the transaction: get_db() does not commit, so without this the write is rolled back.
    await db.commit()
    return _to_incident_dto(resolved)


@router.post(
    "/incidents/{incident_id}/merge",
    summary="Merge duplicate incident into a primary target incident",
    response_model=IncidentResponse,
)
async def merge_incidents(
    incident_id: UUID,
    req: MergeIncidentsRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.VERIFY_REPORT)),
) -> IncidentResponse:
    incident_repo = SqlAlchemyIncidentRepository(db)
    use_case = MergeIncidentsUseCase(incident_repo)

    target = await use_case.execute(
        principal=principal,
        source_incident_id=incident_id,
        target_incident_id=req.target_incident_id,
        notes=req.notes,
    )
    # Handlers own the transaction: get_db() does not commit, so without this the write is rolled back.
    await db.commit()
    return _to_incident_dto(target)
