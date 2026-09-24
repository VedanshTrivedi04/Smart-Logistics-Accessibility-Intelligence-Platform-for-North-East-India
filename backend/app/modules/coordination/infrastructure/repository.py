"""
app/modules/coordination/infrastructure/repository.py — SQLAlchemy repository for coordination.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.coordination.application.ports import CoordinationRepositoryPort
from app.modules.coordination.domain.entities import CoordinationAction, Jurisdiction
from app.modules.coordination.domain.enums import ActionType, SubjectType
from app.modules.coordination.infrastructure.models import CoordinationActionModel
from app.modules.identity.infrastructure.models import JurisdictionModel
from app.modules.incidents.infrastructure.models import IncidentModel


def _to_action(m: CoordinationActionModel) -> CoordinationAction:
    return CoordinationAction(
        id=m.id,
        subject_type=SubjectType(m.subject_type),
        subject_ref=m.subject_ref,
        action=ActionType(m.action),
        target_jurisdiction_id=m.target_jurisdiction_id,
        notes=m.notes,
        actor_id=m.actor_id,
        actor_role=m.actor_role,
        created_at=m.created_at,
    )


def _to_jurisdiction(m: JurisdictionModel) -> Jurisdiction:
    return Jurisdiction(id=m.id, code=m.code, name=m.name, level=m.level, parent_id=m.parent_id)


class SqlAlchemyCoordinationRepository(CoordinationRepositoryPort):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add_action(self, action: CoordinationAction) -> None:
        self.session.add(
            CoordinationActionModel(
                id=action.id,
                subject_type=action.subject_type.value,
                subject_ref=action.subject_ref,
                action=action.action.value,
                target_jurisdiction_id=action.target_jurisdiction_id,
                notes=action.notes,
                actor_id=action.actor_id,
                actor_role=action.actor_role,
                created_at=action.created_at,
            )
        )
        await self.session.flush()

    async def list_actions(
        self,
        *,
        subject_type: SubjectType | None,
        subject_ref: str | None,
        limit: int,
    ) -> list[CoordinationAction]:
        stmt = select(CoordinationActionModel)
        if subject_type is not None:
            stmt = stmt.where(CoordinationActionModel.subject_type == subject_type.value)
        if subject_ref is not None:
            stmt = stmt.where(CoordinationActionModel.subject_ref == subject_ref)
        stmt = stmt.order_by(CoordinationActionModel.created_at.desc()).limit(limit)
        res = await self.session.execute(stmt)
        return [_to_action(m) for m in res.scalars().all()]

    async def get_jurisdiction(self, jurisdiction_id: UUID) -> Jurisdiction | None:
        m = await self.session.get(JurisdictionModel, jurisdiction_id)
        return _to_jurisdiction(m) if m else None

    async def list_jurisdictions(self) -> list[Jurisdiction]:
        res = await self.session.execute(select(JurisdictionModel).order_by(JurisdictionModel.level, JurisdictionModel.name))
        return [_to_jurisdiction(m) for m in res.scalars().all()]

    async def incident_exists(self, incident_id: UUID) -> bool:
        res = await self.session.execute(select(IncidentModel.id).where(IncidentModel.id == incident_id))
        return res.scalar_one_or_none() is not None
