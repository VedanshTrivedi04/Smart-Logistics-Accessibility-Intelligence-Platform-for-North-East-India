"""
tests/integration/incidents/test_incident_merge.py — Integration tests for incident merging and deduplication.
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
from app.modules.incidents.application.merge_incidents import MergeIncidentsUseCase
from app.modules.incidents.domain.entities import Incident
from app.modules.incidents.domain.enums import IncidentLifecycle, ResolutionReason
from app.modules.incidents.infrastructure.models import IncidentMergeModel, IncidentReportModel
from app.modules.incidents.infrastructure.repository import SqlAlchemyIncidentRepository
from app.modules.reporting.domain.enums import ReportSeverity

USER_DISTRICT_VERIFIER = UUID("d0000003-0000-4000-8000-000000000003")
ORG_GOV_ID = UUID("00000000-0000-4000-a000-000000000001")


@pytest.fixture
def verifier_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=USER_DISTRICT_VERIFIER,
        org_id=ORG_GOV_ID,
        org_name="Kamrup District Administration",
        org_kind=OrgKind.GOVERNMENT,
        role=Role.DISTRICT_VERIFIER,
        capabilities=frozenset([Capability.VERIFY_REPORT]),
    )


class TestIncidentMergeIntegration:
    async def test_merge_incidents_reparents_reports_and_audits(
        self,
        verifier_principal: PrincipalContext,
    ) -> None:
        async with AsyncSessionLocal() as session:
            incident_repo = SqlAlchemyIncidentRepository(session)
            merge_use_case = MergeIncidentsUseCase(incident_repo)

            # Need 2 report IDs
            rep_res = await session.execute(text("SELECT id FROM reports LIMIT 2"))
            rows = rep_res.scalars().all()
            rep_1, rep_2 = rows[0], rows[1]

            now = datetime.now(timezone.utc)

            # 1. Primary Incident
            primary_inc = Incident(
                id=uuid.uuid4(),
                primary_report_id=rep_1,
                lifecycle=IncidentLifecycle.ACTIVE,
                severity=ReportSeverity.HIGH,
                title="Primary Slide Incident",
                description="Primary landslide report",
                created_at=now,
            )
            await incident_repo.create_incident(primary_inc, primary_report_id=rep_1)

            # 2. Duplicate Incident
            duplicate_inc = Incident(
                id=uuid.uuid4(),
                primary_report_id=rep_2,
                lifecycle=IncidentLifecycle.ACTIVE,
                severity=ReportSeverity.HIGH,
                title="Duplicate Slide Incident",
                description="Duplicate report from second observer",
                created_at=now,
            )
            await incident_repo.create_incident(duplicate_inc, primary_report_id=rep_2)
            await session.commit()

            # 3. Merge Duplicate into Primary
            target = await merge_use_case.execute(
                principal=verifier_principal,
                source_incident_id=duplicate_inc.id,
                target_incident_id=primary_inc.id,
                notes="Verified duplicate observation of the same physical blockage",
            )
            await session.commit()

            assert target.id == primary_inc.id

            # 4. Verify Duplicate is marked RESOLVED with MERGED_INTO
            dup_reloaded = await incident_repo.get_incident_by_id(duplicate_inc.id)
            assert dup_reloaded is not None
            assert dup_reloaded.lifecycle == IncidentLifecycle.RESOLVED
            assert dup_reloaded.resolution_reason == ResolutionReason.MERGED_INTO

            # 5. Verify rep_2 is now linked to primary incident
            link = await session.get(IncidentReportModel, (primary_inc.id, rep_2))
            assert link is not None

            # 6. Verify audit entry in incident_merges
            merge_record = await session.execute(
                text("SELECT id, source_incident_id, target_incident_id FROM incident_merges WHERE source_incident_id = :src"),
                {"src": duplicate_inc.id},
            )
            m_row = merge_record.first()
            assert m_row is not None
            assert m_row[2] == primary_inc.id
