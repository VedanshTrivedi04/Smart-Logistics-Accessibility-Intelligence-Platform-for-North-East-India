"""
app/modules/coordination/application/record_action.py — Record and read coordination actions.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.modules.coordination.application.ports import CoordinationRepositoryPort
from app.modules.coordination.domain.entities import CoordinationAction
from app.modules.coordination.domain.enums import ActionType, SubjectType
from app.modules.coordination.domain.exceptions import CoordinationTargetNotFoundError
from app.modules.coordination.domain.rules import (
    SubjectSummary,
    normalize_notes,
    summarize_all,
    validate_action,
    validate_against_history,
)

# Bounds the rows read for one summary request. Subjects with more history than this
# are summarized from their most recent actions only.
MAX_ACTIONS_READ = 1000


class RecordCoordinationActionUseCase:
    def __init__(self, repository: CoordinationRepositoryPort):
        self.repository = repository

    async def execute(
        self,
        *,
        actor_id: UUID,
        actor_role: str,
        subject_type: SubjectType,
        subject_ref: str,
        action: ActionType,
        target_jurisdiction_id: UUID | None,
        notes: str | None,
    ) -> CoordinationAction:
        subject_ref = subject_ref.strip()
        notes = normalize_notes(notes)
        validate_action(
            subject_type=subject_type,
            subject_ref=subject_ref,
            action=action,
            target_jurisdiction_id=target_jurisdiction_id,
            notes=notes,
        )

        if target_jurisdiction_id is not None and await self.repository.get_jurisdiction(target_jurisdiction_id) is None:
            raise CoordinationTargetNotFoundError(f"Jurisdiction '{target_jurisdiction_id}' not found")

        if subject_type is SubjectType.INCIDENT:
            try:
                incident_id = UUID(subject_ref)
            except ValueError:
                raise CoordinationTargetNotFoundError(f"Incident '{subject_ref}' not found") from None
            if not await self.repository.incident_exists(incident_id):
                raise CoordinationTargetNotFoundError(f"Incident '{subject_ref}' not found")

        history = await self.repository.list_actions(subject_type=subject_type, subject_ref=subject_ref, limit=MAX_ACTIONS_READ)
        validate_against_history(action, history)

        record = CoordinationAction(
            id=uuid4(),
            subject_type=subject_type,
            subject_ref=subject_ref,
            action=action,
            target_jurisdiction_id=target_jurisdiction_id,
            notes=notes,
            actor_id=actor_id,
            actor_role=actor_role,
            created_at=datetime.now(timezone.utc),
        )
        await self.repository.add_action(record)
        return record


class ListCoordinationSummariesUseCase:
    def __init__(self, repository: CoordinationRepositoryPort):
        self.repository = repository

    async def execute(
        self,
        *,
        subject_type: SubjectType | None,
        subject_ref: str | None,
        limit: int = MAX_ACTIONS_READ,
    ) -> list[SubjectSummary]:
        actions = await self.repository.list_actions(subject_type=subject_type, subject_ref=subject_ref, limit=min(limit, MAX_ACTIONS_READ))
        return summarize_all(actions)
