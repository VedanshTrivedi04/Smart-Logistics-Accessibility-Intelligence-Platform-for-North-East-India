"""
tests/integration/reporting/test_batch_sync_isolation.py — Integration tests for sub-transaction batch sync isolation.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from uuid import UUID

import pytest

from app.core.db import AsyncSessionLocal
from app.core.security import PrincipalContext
from app.modules.identity.domain.enums import Capability, OrgKind, Role
from app.modules.incidents.infrastructure.repository import SqlAlchemyIncidentRepository
from app.modules.reporting.application.submit_report import SubmitFieldReportUseCase
from app.modules.reporting.application.sync_reports import SyncReportsBatchUseCase
from app.modules.reporting.infrastructure.repository import SqlAlchemyReportingRepository

USER_FIELD_OFFICER = UUID("d0000005-0000-4000-8000-000000000005")
ORG_FIELD_ID = UUID("00000000-0000-4000-a000-000000000002")
JURIS_KAMRUP = UUID("00000003-0000-4000-8000-000000000001")


@pytest.fixture
def field_officer_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=USER_FIELD_OFFICER,
        org_id=ORG_FIELD_ID,
        org_name="Assam Field Authority",
        org_kind=OrgKind.FIELD_AUTHORITY,
        role=Role.FIELD_OFFICER,
        capabilities=frozenset([
            Capability.SUBMIT_REPORT,
            Capability.VIEW_REPORT_SUMMARY,
            Capability.VIEW_REPORT_DETAIL,
        ]),
        jurisdiction_ids=frozenset([JURIS_KAMRUP]),
    )


class TestBatchSyncIsolation:
    async def test_batch_sync_subtransaction_isolation(
        self,
        field_officer_principal: PrincipalContext,
    ) -> None:
        async with AsyncSessionLocal() as session:
            reporting_repo = SqlAlchemyReportingRepository(session)
            incident_repo = SqlAlchemyIncidentRepository(session)
            submit_use_case = SubmitFieldReportUseCase(reporting_repo, incident_repo)
            sync_use_case = SyncReportsBatchUseCase(session, reporting_repo, submit_use_case)

            now_str = datetime.now(timezone.utc).isoformat()
            batch = [
                # Item 1: Valid report
                {
                    "client_operation_id": f"batch_sync_valid1_{uuid.uuid4().hex[:6]}",
                    "report_type": "LANDSLIDE",
                    "severity": "HIGH",
                    "description": "Valid landslide observation 1",
                    "location": {"longitude": 91.85, "latitude": 26.10, "accuracy_m": 12.0},
                    "observed_at": now_str,
                },
                # Item 2: INVALID report (Longitude 50.0 is in Iran/Arabian Sea, far outside North-East India bounds [89.5, 97.5])
                {
                    "client_operation_id": f"batch_sync_invalid_{uuid.uuid4().hex[:6]}",
                    "report_type": "ROAD_DAMAGE",
                    "severity": "MEDIUM",
                    "description": "Invalid location out of bounds",
                    "location": {"longitude": 50.0, "latitude": 26.10, "accuracy_m": 10.0},
                    "observed_at": now_str,
                },
                # Item 3: Valid report
                {
                    "client_operation_id": f"batch_sync_valid2_{uuid.uuid4().hex[:6]}",
                    "report_type": "FLOODING",
                    "severity": "MEDIUM",
                    "description": "Valid flooding observation 2",
                    "location": {"longitude": 91.82, "latitude": 26.11, "accuracy_m": 15.0},
                    "observed_at": now_str,
                },
            ]

            result = await sync_use_case.execute(
                principal=field_officer_principal,
                batch_items=batch,
                device_id="device_batch_test_01",
            )
            await session.commit()

            # Verify sub-transaction isolation:
            # The invalid item #2 failed, but did NOT cause the whole batch to fail!
            assert result["total_submitted"] == 3
            assert result["succeeded_count"] == 2
            assert result["failed_count"] == 1

            assert len(result["succeeded"]) == 2
            assert len(result["failed"]) == 1

            # Verify the 2 valid reports exist in DB
            rep1_id = UUID(result["succeeded"][0]["report_id"])
            rep2_id = UUID(result["succeeded"][1]["report_id"])

            db_rep1 = await reporting_repo.get_report_by_id(rep1_id)
            db_rep2 = await reporting_repo.get_report_by_id(rep2_id)
            assert db_rep1 is not None
            assert db_rep2 is not None

            # Verify the failed item has error code
            failed_item = result["failed"][0]
            assert "outside North-Eastern Region" in failed_item["message"]
