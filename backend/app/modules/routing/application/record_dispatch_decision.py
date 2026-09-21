"""
app/modules/routing/application/record_dispatch_decision.py — Human Dispatch Decision Use Case (ADR-07).
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.modules.routing.application.ports import RoutingRepositoryPort
from app.modules.routing.domain.entities import DispatchDecision
from app.modules.routing.domain.enums import DispatchAction
from app.modules.routing.domain.exceptions import (
    RoutePlanNotFoundError,
    StaleRouteError,
)


class RecordDispatchDecisionUseCase:
    def __init__(self, repository: RoutingRepositoryPort):
        self.repository = repository

    async def execute(
        self,
        trip_id: UUID,
        route_plan_id: UUID,
        actor_id: UUID,
        action: DispatchAction,
        reason: str,
        selected_alternative_rank: int = 0,
    ) -> DispatchDecision:
        now = datetime.now(timezone.utc)

        # 1. Fetch Route Plan Snapshot
        plan = await self.repository.get_route_plan_by_id(route_plan_id)
        if not plan:
            raise RoutePlanNotFoundError(f"Route plan '{route_plan_id}' not found")

        # 2. Check Expiry
        if now > plan.expires_at:
            raise StaleRouteError("Route plan snapshot has expired. Re-evaluate route before dispatch.")

        # 3. Check Live Network Status Version Freshness
        _, _, live_status_version = await self.repository.get_active_network_version()
        if plan.status_version < live_status_version:
            raise StaleRouteError(
                f"Road network status changed since evaluation (plan status_version: {plan.status_version}, "
                f"live status_version: {live_status_version}). Re-evaluate route before dispatch."
            )

        # 4. Create & Persist Decision
        decision = DispatchDecision(
            id=uuid4(),
            trip_id=trip_id,
            route_plan_id=route_plan_id,
            actor_id=actor_id,
            action=action,
            selected_alternative_rank=selected_alternative_rank,
            reason=reason,
            status_version_at_decision=live_status_version,
            decided_at=now,
        )

        await self.repository.save_dispatch_decision(decision)
        return decision
