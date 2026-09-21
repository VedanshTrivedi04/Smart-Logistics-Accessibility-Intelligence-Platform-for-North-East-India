"""
tests/integration/incidents/test_incident_resolution_recalc.py — Integration tests for safe road reopening recalculation.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from uuid import UUID

import pytest
from sqlalchemy import text

from app.core.db import AsyncSessionLocal
from app.core.security import PrincipalContext
from app.modules.identity.domain.enums import Capability, OrgKind, Role
from app.modules.incidents.application.resolve_incident import ResolveIncidentUseCase
from app.modules.incidents.domain.entities import Incident
from app.modules.incidents.domain.enums import IncidentLifecycle, ResolutionReason
from app.modules.incidents.infrastructure.repository import SqlAlchemyIncidentRepository
from app.modules.network.application.declare_edge_status import DeclareEdgeStatusUseCase
from app.modules.network.domain.enums import AccessibilityStatus
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository
from app.modules.reporting.domain.enums import ReportSeverity

USER_DISTRICT_VERIFIER = UUID("d0000003-0000-4000-8000-000000000003")
ORG_GOV_ID = UUID("00000000-0000-4000-a000-000000000001")
JURIS_KAMRUP = UUID("00000003-0000-4000-8000-000000000001")


@pytest.fixture
def verifier_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=USER_DISTRICT_VERIFIER,
        org_id=ORG_GOV_ID,
        org_name="Kamrup District Administration",
        org_kind=OrgKind.GOVERNMENT,
        role=Role.DISTRICT_VERIFIER,
        capabilities=frozenset([Capability.VERIFY_REPORT]),
        jurisdiction_ids=frozenset([JURIS_KAMRUP]),
    )


@pytest.fixture
async def sample_edge_id() -> UUID:
    async with AsyncSessionLocal() as session:
        res = await session.execute(
            text("""
                SELECT re.id FROM road_edges re
                WHERE re.id NOT IN (
                    SELECT ie.edge_id FROM incident_edges ie
                    JOIN incidents inc ON inc.id = ie.incident_id
                    WHERE inc.lifecycle IN ('ACTIVE', 'MONITORING')
                )
                ORDER BY re.edge_index DESC
                LIMIT 1
            """)
        )
        row = res.first()
        if row:
            return row[0]
        # Fallback if all edges have active incidents
        res2 = await session.execute(text("SELECT id FROM road_edges ORDER BY edge_index DESC LIMIT 1"))
        row = res2.first()
        if not row:
            pytest.skip("No road edges found in DB")
        await session.execute(text("DELETE FROM incident_edges WHERE edge_id = :eid"), {"eid": row[0]})
        await session.commit()
        return row[0]


class TestIncidentResolutionRecalc:
    async def test_safe_edge_recalculation_upon_resolution(
        self,
        verifier_principal: PrincipalContext,
        sample_edge_id: UUID,
    ) -> None:
        async with AsyncSessionLocal() as session:
            incident_repo = SqlAlchemyIncidentRepository(session)
            network_repo = SqlAlchemyNetworkRepository(session)
            declare_status_use_case = DeclareEdgeStatusUseCase(network_repo, network_repo)

            resolve_use_case = ResolveIncidentUseCase(
                incident_repo=incident_repo,
                declare_status_use_case=declare_status_use_case,
            )

            # Need a primary report ID to link to incidents
            rep_res = await session.execute(text("SELECT id FROM reports LIMIT 1"))
            primary_report_id = rep_res.scalar_one()

            now = datetime.now(timezone.utc)

            # 1. Create Incident A (CRITICAL, full closure)
            inc_a = Incident(
                id=uuid.uuid4(),
                primary_report_id=primary_report_id,
                lifecycle=IncidentLifecycle.ACTIVE,
                severity=ReportSeverity.CRITICAL,
                title="Massive Rockfall Incident A",
                description="Entire road blocked by boulder",
                created_at=now,
            )
            await incident_repo.create_incident(
                incident=inc_a,
                primary_report_id=primary_report_id,
                affected_edges=[(sample_edge_id, "BOTH", True)],
            )

            # 2. Create Incident B (MEDIUM, partial restriction) on the same edge
            inc_b = Incident(
                id=uuid.uuid4(),
                primary_report_id=primary_report_id,
                lifecycle=IncidentLifecycle.ACTIVE,
                severity=ReportSeverity.MEDIUM,
                title="Water Accumulation Incident B",
                description="Surface water on south lane",
                created_at=now,
            )
            await incident_repo.create_incident(
                incident=inc_b,
                primary_report_id=primary_report_id,
                affected_edges=[(sample_edge_id, "BOTH", False)],
            )
            await session.commit()

            # 3. Resolve Incident A
            # Crucial check: Road edge must NOT simply become OPEN because Incident B is still active!
            await resolve_use_case.execute(
                principal=verifier_principal,
                incident_id=inc_a.id,
                reason=ResolutionReason.HAZARD_CLEARED,
                notes="Boulder pushed off roadway",
                affected_edge_ids=[sample_edge_id],
            )
            await session.commit()

            # Verify edge is RESTRICTED (not OPEN, because Incident B is active)
            status_after_a = await network_repo.get_current_status(sample_edge_id)
            assert status_after_a is not None
            assert status_after_a.status == AccessibilityStatus.RESTRICTED

            # 4. Resolve Incident B
            # Now all incidents are resolved -> edge safely transitions to OPEN
            await resolve_use_case.execute(
                principal=verifier_principal,
                incident_id=inc_b.id,
                reason=ResolutionReason.REPAIRS_COMPLETED,
                notes="Drainage cleared, all lanes dry",
                affected_edge_ids=[sample_edge_id],
            )
            await session.commit()

            status_after_b = await network_repo.get_current_status(sample_edge_id)
            assert status_after_b is not None
            assert status_after_b.status == AccessibilityStatus.OPEN
