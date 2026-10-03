"""
app/modules/inspection/infrastructure/repository.py — SQLAlchemy Implementation of InspectionRepositoryPort.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import desc, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.inspection.application.ports import InspectionRepositoryPort
from app.modules.inspection.domain.entities import (
    Inspection,
    InspectionEvidence,
    InspectorSummary,
    TechnicalAssessment,
)
from app.modules.inspection.domain.enums import (
    DamageType,
    EvidenceKind,
    InspectionPriority,
    InspectionStatus,
    PassabilityStatus,
    StructuralStability,
)
from app.modules.inspection.infrastructure.models import (
    InspectionMediaModel,
    InspectionModel,
)


def _to_entity(m: InspectionModel) -> Inspection:
    assessment: TechnicalAssessment | None = None
    if m.road_condition or m.passability or m.damage_type:
        assessment = TechnicalAssessment(
            road_condition=m.road_condition or "",
            passability=PassabilityStatus(m.passability) if m.passability else PassabilityStatus.IMPASSABLE,
            damage_type=DamageType(m.damage_type) if m.damage_type else DamageType.OTHER,
            stability=StructuralStability(m.stability) if m.stability else StructuralStability.STABLE,
            affected_length_m=m.affected_length_m,
            affected_width_m=m.affected_width_m,
            debris_depth_m=m.debris_depth_m,
            bridge_pier_scour_depth_m=m.bridge_pier_scour_depth_m,
            water_level_over_road_cm=m.water_level_over_road_cm,
            slope_movement_detected=m.slope_movement_detected,
            heavy_vehicle_passable=m.heavy_vehicle_passable,
            recommended_speed_limit_kmh=m.recommended_speed_limit_kmh,
            technical_notes=m.technical_notes or "",
            raw_measurements=m.raw_measurements or {},
        )

    evidence_list = [
        InspectionEvidence(
            id=e.id,
            inspection_id=e.inspection_id,
            media_id=e.media_id,
            kind=EvidenceKind(e.kind) if e.kind in EvidenceKind._value2member_map_ else EvidenceKind.WIDE_ANGLE,
            caption=e.caption,
            captured_at=e.captured_at,
            latitude=e.latitude,
            longitude=e.longitude,
            altitude_m=e.altitude_m,
            azimuth_deg=e.azimuth_deg,
        )
        for e in (m.evidence_items or [])
    ]

    return Inspection(
        id=m.id,
        jurisdiction_id=m.jurisdiction_id,
        assigned_to=m.assigned_to,
        assigned_by=m.assigned_by,
        priority=InspectionPriority(m.priority),
        status=InspectionStatus(m.status),
        instructions=m.instructions,
        created_at=m.created_at,
        updated_at=m.updated_at,
        report_id=m.report_id,
        incident_id=m.incident_id,
        candidate_edge_id=m.candidate_edge_id,
        started_at=m.started_at,
        completed_at=m.completed_at,
        assessment=assessment,
        evidence=evidence_list,
        final_decision=m.final_decision,
        decision_notes=m.decision_notes,
    )


class SqlAlchemyInspectionRepository(InspectionRepositoryPort):
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_inspection(self, inspection: Inspection) -> Inspection:
        model = InspectionModel(
            id=inspection.id,
            jurisdiction_id=inspection.jurisdiction_id,
            report_id=inspection.report_id,
            incident_id=inspection.incident_id,
            candidate_edge_id=inspection.candidate_edge_id,
            assigned_to=inspection.assigned_to,
            assigned_by=inspection.assigned_by,
            priority=inspection.priority.value,
            status=inspection.status.value,
            instructions=inspection.instructions,
            created_at=inspection.created_at,
            updated_at=inspection.updated_at,
        )
        self.session.add(model)
        await self.session.flush()
        return inspection

    async def get_inspection_by_id(self, inspection_id: UUID) -> Inspection | None:
        stmt = (
            select(InspectionModel)
            .where(InspectionModel.id == inspection_id)
            .options(selectinload(InspectionModel.evidence_items))
        )
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        return _to_entity(m) if m else None

    async def update_inspection(self, inspection: Inspection) -> Inspection:
        stmt = select(InspectionModel).where(InspectionModel.id == inspection.id)
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            raise ValueError(f"Inspection {inspection.id} not found for update")

        m.status = inspection.status.value
        m.priority = inspection.priority.value
        m.instructions = inspection.instructions
        m.started_at = inspection.started_at
        m.completed_at = inspection.completed_at
        m.final_decision = inspection.final_decision
        m.decision_notes = inspection.decision_notes
        m.updated_at = datetime.now(UTC)

        if inspection.assessment:
            a = inspection.assessment
            m.road_condition = a.road_condition
            m.passability = a.passability.value
            m.damage_type = a.damage_type.value
            m.stability = a.stability.value if a.stability else None
            m.affected_length_m = a.affected_length_m
            m.affected_width_m = a.affected_width_m
            m.debris_depth_m = a.debris_depth_m
            m.bridge_pier_scour_depth_m = a.bridge_pier_scour_depth_m
            m.water_level_over_road_cm = a.water_level_over_road_cm
            m.slope_movement_detected = a.slope_movement_detected
            m.heavy_vehicle_passable = a.heavy_vehicle_passable
            m.recommended_speed_limit_kmh = a.recommended_speed_limit_kmh
            m.technical_notes = a.technical_notes
            m.raw_measurements = a.raw_measurements

        await self.session.flush()
        return await self.get_inspection_by_id(inspection.id) or inspection

    async def list_inspections(
        self,
        *,
        assigned_to: UUID | None = None,
        jurisdiction_id: UUID | None = None,
        status: InspectionStatus | None = None,
        edge_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Inspection]:
        stmt = select(InspectionModel).options(selectinload(InspectionModel.evidence_items))
        if assigned_to:
            stmt = stmt.where(InspectionModel.assigned_to == assigned_to)
        if jurisdiction_id:
            stmt = stmt.where(InspectionModel.jurisdiction_id == jurisdiction_id)
        if status:
            stmt = stmt.where(InspectionModel.status == status.value)
        if edge_id:
            stmt = stmt.where(InspectionModel.candidate_edge_id == edge_id)

        stmt = stmt.order_by(desc(InspectionModel.created_at)).limit(limit).offset(offset)
        res = await self.session.execute(stmt)
        return [_to_entity(m) for m in res.scalars().all()]

    async def count_by_status(self, *, assigned_to: UUID | None = None) -> dict[str, int]:
        stmt = select(InspectionModel.status, func.count(InspectionModel.id))
        if assigned_to:
            stmt = stmt.where(InspectionModel.assigned_to == assigned_to)
        stmt = stmt.group_by(InspectionModel.status)
        res = await self.session.execute(stmt)
        counts = {s.value: 0 for s in InspectionStatus}
        for status_val, count in res.all():
            counts[status_val] = count
        return counts

    async def add_evidence(self, evidence: InspectionEvidence) -> InspectionEvidence:
        model = InspectionMediaModel(
            id=evidence.id,
            inspection_id=evidence.inspection_id,
            media_id=evidence.media_id,
            kind=evidence.kind.value,
            caption=evidence.caption,
            latitude=evidence.latitude,
            longitude=evidence.longitude,
            altitude_m=evidence.altitude_m,
            azimuth_deg=evidence.azimuth_deg,
            captured_at=evidence.captured_at,
        )
        self.session.add(model)
        await self.session.flush()
        return evidence

    async def get_latest_inspection_for_edge(self, edge_id: str) -> Inspection | None:
        stmt = (
            select(InspectionModel)
            .where(InspectionModel.candidate_edge_id == edge_id)
            .options(selectinload(InspectionModel.evidence_items))
            .order_by(desc(InspectionModel.created_at))
            .limit(1)
        )
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        return _to_entity(m) if m else None

    async def list_available_inspectors(self) -> list[InspectorSummary]:
        stmt = text(
            "select u.id, u.display_name, u.email, o.name as org_name "
            "from users u "
            "join memberships m on m.user_id = u.id and m.status = 'ACTIVE' "
            "join organizations o on o.id = m.org_id "
            "where m.role = 'ROAD_INSPECTION' and u.is_active = true "
            "order by u.display_name"
        )
        res = await self.session.execute(stmt)
        return [
            InspectorSummary(user_id=row.id, display_name=row.display_name, email=row.email, org_name=row.org_name)
            for row in res.all()
        ]
