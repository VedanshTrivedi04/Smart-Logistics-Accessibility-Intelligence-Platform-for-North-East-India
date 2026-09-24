"""
app/modules/coordination/api/router.py — Jurisdictions and coordination actions.

Coordination records who acknowledged, escalated, assigned or asked for inspection of an
incident, alert, facility or trip. It is a log for human coordination: recording an action
notifies no one and changes no road, trip or incident state.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

from app.core.db import DbSession, get_db_session
from app.core.security import PrincipalContext, require_authenticated, require_capability
from app.modules.coordination.api.schemas import (
    CoordinationActionRequest,
    CoordinationActionResponse,
    CoordinationSummaryResponse,
    JurisdictionResponse,
)
from app.modules.coordination.application.record_action import (
    ListCoordinationSummariesUseCase,
    RecordCoordinationActionUseCase,
)
from app.modules.coordination.domain.entities import CoordinationAction
from app.modules.coordination.domain.enums import SubjectType
from app.modules.coordination.domain.rules import SubjectSummary
from app.modules.coordination.infrastructure.repository import SqlAlchemyCoordinationRepository
from app.modules.identity.domain.enums import Capability

router = APIRouter(tags=["Coordination"])


def _to_action_response(a: CoordinationAction) -> CoordinationActionResponse:
    return CoordinationActionResponse(
        id=a.id,
        subject_type=a.subject_type,
        subject_ref=a.subject_ref,
        action=a.action,
        target_jurisdiction_id=a.target_jurisdiction_id,
        notes=a.notes,
        actor_id=a.actor_id,
        actor_role=a.actor_role,
        created_at=a.created_at,
    )


def _to_summary_response(s: SubjectSummary) -> CoordinationSummaryResponse:
    return CoordinationSummaryResponse(
        subject_type=s.subject_type,
        subject_ref=s.subject_ref,
        acknowledged=s.acknowledged,
        acknowledged_at=s.acknowledged_at,
        acknowledged_by=s.acknowledged_by,
        escalated_to_jurisdiction_id=s.escalated_to_jurisdiction_id,
        escalated_at=s.escalated_at,
        assigned_jurisdiction_id=s.assigned_jurisdiction_id,
        assigned_at=s.assigned_at,
        inspection_status=s.inspection_status,
        last_action_at=s.last_action_at,
        actions=[_to_action_response(a) for a in s.actions],
    )


@router.get(
    "/jurisdictions",
    summary="List the region, states and districts (public reference data)",
    response_model=list[JurisdictionResponse],
)
async def list_jurisdictions(
    principal: PrincipalContext = Depends(require_authenticated),
    session: DbSession = Depends(get_db_session),
) -> list[JurisdictionResponse]:
    repo = SqlAlchemyCoordinationRepository(session)
    return [
        JurisdictionResponse(id=j.id, code=j.code, name=j.name, level=j.level, parent_id=j.parent_id)
        for j in await repo.list_jurisdictions()
    ]


@router.post(
    "/coordination/actions",
    summary="Record an acknowledgement, escalation, assignment, inspection request or note",
    response_model=CoordinationActionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def record_coordination_action(
    req: CoordinationActionRequest,
    principal: PrincipalContext = Depends(require_capability(Capability.COORDINATE_RESPONSE)),
    session: DbSession = Depends(get_db_session),
) -> CoordinationActionResponse:
    repo = SqlAlchemyCoordinationRepository(session)
    action = await RecordCoordinationActionUseCase(repo).execute(
        actor_id=principal.user_id,
        actor_role=principal.role.value,
        subject_type=req.subject_type,
        subject_ref=req.subject_ref,
        action=req.action,
        target_jurisdiction_id=req.target_jurisdiction_id,
        notes=req.notes,
    )
    await session.commit()
    return _to_action_response(action)


@router.get(
    "/coordination/summaries",
    summary="Current coordination state per subject, with its action history",
    response_model=list[CoordinationSummaryResponse],
)
async def list_coordination_summaries(
    subject_type: SubjectType | None = Query(default=None),
    subject_ref: str | None = Query(default=None, max_length=128),
    principal: PrincipalContext = Depends(require_capability(Capability.COORDINATE_RESPONSE)),
    session: DbSession = Depends(get_db_session),
) -> list[CoordinationSummaryResponse]:
    repo = SqlAlchemyCoordinationRepository(session)
    summaries = await ListCoordinationSummariesUseCase(repo).execute(subject_type=subject_type, subject_ref=subject_ref)
    return [_to_summary_response(s) for s in summaries]
