"""
app/modules/inspection/api/router.py — FastAPI Router for Road Inspection Intelligence.
"""

from __future__ import annotations

import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.db import DbSession as AsyncSession, get_db
from app.core.security import (
    PrincipalContext,
    require_any_capability,
    require_authenticated,
    require_capability,
)
from app.modules.identity.domain.enums import Capability
from app.modules.incidents.application.verify_report import VerifyReportUseCase
from app.modules.incidents.infrastructure.repository import SqlAlchemyIncidentRepository
from app.modules.inspection.api.schemas import (
    AssignInspectionRequest,
    DecideInspectionRequest,
    InspectionEvidenceResponse,
    InspectionResponse,
    InspectionStatsResponse,
    InspectorSummaryResponse,
    SubmitAssessmentRequest,
    TechnicalAssessmentSchema,
)
from app.modules.inspection.application.use_cases import (
    AssignInspectionUseCase,
    DecideInspectionUseCase,
    GetInspectionDetailUseCase,
    GetInspectionStatsUseCase,
    GetLatestEdgeInspectionUseCase,
    ListInspectionsUseCase,
    StartInspectionUseCase,
    SubmitInspectionAssessmentUseCase,
)
from app.modules.inspection.domain.entities import (
    Inspection,
    InspectionEvidence,
    TechnicalAssessment,
)
from app.modules.inspection.domain.enums import (
    DamageType,
    EvidenceKind,
    InspectionStatus,
    PassabilityStatus,
    StructuralStability,
)
from app.modules.inspection.domain.exceptions import (
    InspectionAssignmentError,
    InspectionNotFoundError,
    InspectionStateError,
    InspectionValidationError,
    SelfInspectionForbiddenError,
)
from app.modules.inspection.infrastructure.repository import SqlAlchemyInspectionRepository
from app.modules.network.application.declare_edge_status import make_edge_status_outbox_notifier
from app.modules.network.application.declare_edge_status import DeclareEdgeStatusUseCase
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository
from app.modules.reporting.infrastructure.repository import SqlAlchemyReportingRepository

router = APIRouter(tags=["Road Inspection Intelligence"])

_INSPECTION_ACCESS = require_any_capability(
    Capability.CONDUCT_INSPECTION, Capability.ASSIGN_INSPECTION, Capability.COORDINATE_RESPONSE
)


def _to_dto(i: Inspection) -> InspectionResponse:
    assessment_dto = None
    if i.assessment:
        a = i.assessment
        assessment_dto = TechnicalAssessmentSchema(
            road_condition=a.road_condition,
            passability=a.passability,
            damage_type=a.damage_type,
            stability=a.stability,
            affected_length_m=a.affected_length_m,
            affected_width_m=a.affected_width_m,
            debris_depth_m=a.debris_depth_m,
            bridge_pier_scour_depth_m=a.bridge_pier_scour_depth_m,
            water_level_over_road_cm=a.water_level_over_road_cm,
            slope_movement_detected=a.slope_movement_detected,
            heavy_vehicle_passable=a.heavy_vehicle_passable,
            recommended_speed_limit_kmh=a.recommended_speed_limit_kmh,
            technical_notes=a.technical_notes,
            raw_measurements=a.raw_measurements,
        )

    evidence_dtos = [
        InspectionEvidenceResponse(
            id=e.id,
            media_id=e.media_id,
            kind=e.kind,
            caption=e.caption,
            latitude=e.latitude,
            longitude=e.longitude,
            altitude_m=e.altitude_m,
            azimuth_deg=e.azimuth_deg,
            captured_at=e.captured_at,
        )
        for e in i.evidence
    ]

    return InspectionResponse(
        id=i.id,
        jurisdiction_id=i.jurisdiction_id,
        assigned_to=i.assigned_to,
        assigned_by=i.assigned_by,
        priority=i.priority,
        status=i.status,
        instructions=i.instructions,
        report_id=i.report_id,
        incident_id=i.incident_id,
        candidate_edge_id=i.candidate_edge_id,
        started_at=i.started_at,
        completed_at=i.completed_at,
        created_at=i.created_at,
        updated_at=i.updated_at,
        final_decision=i.final_decision,
        decision_notes=i.decision_notes,
        assessment=assessment_dto,
        evidence=evidence_dtos,
    )


@router.get("/inspectors", response_model=list[InspectorSummaryResponse])
async def list_available_inspectors(
    principal: PrincipalContext = Depends(_INSPECTION_ACCESS),
    db: AsyncSession = Depends(get_db),
) -> list[InspectorSummaryResponse]:
    """Users an inspection can be assigned to, for the assignment picker."""
    repo = SqlAlchemyInspectionRepository(db)
    inspectors = await repo.list_available_inspectors()
    return [InspectorSummaryResponse(user_id=i.user_id, display_name=i.display_name, email=i.email, org_name=i.org_name) for i in inspectors]


@router.post("", response_model=InspectionResponse, status_code=status.HTTP_201_CREATED)
async def assign_inspection(
    req: AssignInspectionRequest,
    principal: PrincipalContext = Depends(_INSPECTION_ACCESS),
    db: AsyncSession = Depends(get_db),
) -> InspectionResponse:
    """Dispatches a formal road inspection task to an inspector."""
    repo = SqlAlchemyInspectionRepository(db)
    use_case = AssignInspectionUseCase(repo)
    try:
        inspection = await use_case.execute(
            principal=principal,
            jurisdiction_id=req.jurisdiction_id,
            assigned_to=req.assigned_to,
            priority=req.priority,
            instructions=req.instructions,
            report_id=req.report_id,
            candidate_edge_id=req.candidate_edge_id,
            incident_id=req.incident_id,
        )
        await db.commit()
        return _to_dto(inspection)
    except InspectionAssignmentError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@router.get("", response_model=list[InspectionResponse])
async def list_inspections(
    status_filter: InspectionStatus | None = Query(None, alias="status"),
    assigned_to: UUID | None = Query(None),
    jurisdiction_id: UUID | None = Query(None),
    edge_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    principal: PrincipalContext = Depends(_INSPECTION_ACCESS),
    db: AsyncSession = Depends(get_db),
) -> list[InspectionResponse]:
    """Lists inspections with optional scoping filters."""
    repo = SqlAlchemyInspectionRepository(db)
    use_case = ListInspectionsUseCase(repo)
    results = await use_case.execute(
        principal=principal,
        assigned_to=assigned_to,
        jurisdiction_id=jurisdiction_id,
        status=status_filter,
        edge_id=edge_id,
        limit=limit,
        offset=offset,
    )
    return [_to_dto(i) for i in results]


@router.get("/stats", response_model=InspectionStatsResponse)
async def get_inspection_stats(
    principal: PrincipalContext = Depends(_INSPECTION_ACCESS),
    db: AsyncSession = Depends(get_db),
) -> InspectionStatsResponse:
    """Returns aggregated status counts for the inspector dashboard."""
    repo = SqlAlchemyInspectionRepository(db)
    use_case = GetInspectionStatsUseCase(repo)
    counts = await use_case.execute(principal=principal)
    return InspectionStatsResponse(counts=counts)


@router.get("/edge/{edge_id}/latest", response_model=InspectionResponse | None)
async def get_latest_inspection_for_edge(
    edge_id: str,
    principal: PrincipalContext = Depends(_INSPECTION_ACCESS),
    db: AsyncSession = Depends(get_db),
) -> InspectionResponse | None:
    """Returns the most recent inspection recorded for a specific road edge, if the caller may see it."""
    repo = SqlAlchemyInspectionRepository(db)
    use_case = GetLatestEdgeInspectionUseCase(repo)
    latest = await use_case.execute(edge_id, principal)
    return _to_dto(latest) if latest else None


@router.get("/{inspection_id}", response_model=InspectionResponse)
async def get_inspection_detail(
    inspection_id: UUID,
    principal: PrincipalContext = Depends(_INSPECTION_ACCESS),
    db: AsyncSession = Depends(get_db),
) -> InspectionResponse:
    """Retrieves full inspection dossier including measurements and evidence."""
    repo = SqlAlchemyInspectionRepository(db)
    use_case = GetInspectionDetailUseCase(repo)
    try:
        inspection = await use_case.execute(inspection_id, principal)
        return _to_dto(inspection)
    except InspectionNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{inspection_id}/start", response_model=InspectionResponse)
async def start_inspection(
    inspection_id: UUID,
    principal: PrincipalContext = Depends(_INSPECTION_ACCESS),
    db: AsyncSession = Depends(get_db),
) -> InspectionResponse:
    """Transitions inspection to IN_PROGRESS and triages linked report."""
    inspection_repo = SqlAlchemyInspectionRepository(db)
    reporting_repo = SqlAlchemyReportingRepository(db)
    use_case = StartInspectionUseCase(inspection_repo, reporting_repo)
    try:
        updated = await use_case.execute(inspection_id, principal)
        await db.commit()
        return _to_dto(updated)
    except InspectionNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except (InspectionAssignmentError, InspectionStateError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{inspection_id}/assessment", response_model=InspectionResponse)
async def submit_assessment(
    inspection_id: UUID,
    req: SubmitAssessmentRequest,
    principal: PrincipalContext = Depends(_INSPECTION_ACCESS),
    db: AsyncSession = Depends(get_db),
) -> InspectionResponse:
    """Records engineering measurements and links categorized photographic evidence."""
    repo = SqlAlchemyInspectionRepository(db)
    reporting_repo = SqlAlchemyReportingRepository(db)
    use_case = SubmitInspectionAssessmentUseCase(repo, reporting_repo)

    a = req.assessment
    assessment_entity = TechnicalAssessment(
        road_condition=a.road_condition,
        passability=a.passability,
        damage_type=a.damage_type,
        stability=a.stability,
        affected_length_m=a.affected_length_m,
        affected_width_m=a.affected_width_m,
        debris_depth_m=a.debris_depth_m,
        bridge_pier_scour_depth_m=a.bridge_pier_scour_depth_m,
        water_level_over_road_cm=a.water_level_over_road_cm,
        slope_movement_detected=a.slope_movement_detected,
        heavy_vehicle_passable=a.heavy_vehicle_passable,
        recommended_speed_limit_kmh=a.recommended_speed_limit_kmh,
        technical_notes=a.technical_notes,
        raw_measurements=a.raw_measurements,
    )

    evidence_entities = [
        InspectionEvidence(
            id=uuid.uuid4(),
            inspection_id=inspection_id,
            media_id=ev.media_id,
            kind=ev.kind,
            caption=ev.caption,
            latitude=ev.latitude,
            longitude=ev.longitude,
            altitude_m=ev.altitude_m,
            azimuth_deg=ev.azimuth_deg,
        )
        for ev in req.evidence
    ]

    try:
        updated = await use_case.execute(
            inspection_id=inspection_id,
            principal=principal,
            assessment=assessment_entity,
            new_evidence=evidence_entities,
        )
        await db.commit()
        return _to_dto(updated)
    except InspectionNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InspectionValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except (InspectionAssignmentError, InspectionStateError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{inspection_id}/decide")
async def decide_inspection(
    inspection_id: UUID,
    req: DecideInspectionRequest,
    principal: PrincipalContext = Depends(_INSPECTION_ACCESS),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submits authoritative decision, atomically updating incident & road status."""
    inspection_repo = SqlAlchemyInspectionRepository(db)
    reporting_repo = SqlAlchemyReportingRepository(db)
    incident_repo = SqlAlchemyIncidentRepository(db)
    network_repo = SqlAlchemyNetworkRepository(db)

    declare_status_use_case = DeclareEdgeStatusUseCase(
        edge_status_repo=network_repo,
        network_repo=network_repo,
        on_status_changed=make_edge_status_outbox_notifier(incident_repo),
    )
    verify_report_use_case = VerifyReportUseCase(
        reporting_repo=reporting_repo,
        incident_repo=incident_repo,
        declare_status_use_case=declare_status_use_case,
    )

    decide_use_case = DecideInspectionUseCase(
        inspection_repo=inspection_repo,
        reporting_repo=reporting_repo,
        verify_report_use_case=verify_report_use_case,
        declare_status_use_case=declare_status_use_case,
    )

    try:
        result = await decide_use_case.execute(
            inspection_id=inspection_id,
            principal=principal,
            decision=req.decision,
            notes=req.notes,
            rejection_reason=req.rejection_reason,
            affected_edges=req.affected_edges,
        )
        await db.commit()
        return result
    except InspectionNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except SelfInspectionForbiddenError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except (InspectionAssignmentError, InspectionStateError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
