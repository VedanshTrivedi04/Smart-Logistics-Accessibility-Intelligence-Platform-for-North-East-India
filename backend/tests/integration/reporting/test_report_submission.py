"""
tests/integration/reporting/test_report_submission.py — Integration tests for field report submission & amendments.
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
from app.modules.reporting.application.amend_report import AmendReportUseCase
from app.modules.reporting.application.submit_report import SubmitFieldReportUseCase
from app.modules.reporting.domain.entities import LocationPoint
from app.modules.reporting.domain.enums import (
    LocationProvider,
    ReportSeverity,
    ReportType,
    ReviewState,
)
from app.modules.reporting.domain.exceptions import (
    DuplicateOperationError,
    ReportAlreadyAdjudicatedError,
)
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


class TestReportSubmissionIntegration:
    async def test_submit_report_and_spatial_snapping(
        self,
        field_officer_principal: PrincipalContext,
    ) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyReportingRepository(session)
            incident_repo = SqlAlchemyIncidentRepository(session)
            use_case = SubmitFieldReportUseCase(repo, incident_repo)

            loc = LocationPoint(
                longitude=91.870,
                latitude=26.065,
                accuracy_m=10.0,
                location_provider=LocationProvider.GPS_HARDWARE,
            )
            now = datetime.now(timezone.utc)
            op_id = f"op_submit_{uuid.uuid4().hex[:8]}"

            report = await use_case.execute(
                principal=field_officer_principal,
                report_type=ReportType.LANDSLIDE,
                severity=ReportSeverity.HIGH,
                description="Heavy debris on NH-6 corridor near Sonapur",
                location=loc,
                observed_at=now,
                client_operation_id=op_id,
            )
            await session.commit()

            assert report.id is not None
            assert report.review_state in {ReviewState.SUBMITTED, ReviewState.PROVISIONAL_CAUTION}
            assert report.candidate_edge_id is not None  # Auto-snapped to corridor edge within 250m!

            # Fetch from DB
            persisted = await repo.get_report_by_id(report.id)
            assert persisted is not None
            assert persisted.description == "Heavy debris on NH-6 corridor near Sonapur"
            assert persisted.location.longitude == pytest.approx(91.870, abs=0.001)

    async def test_idempotent_replay_and_conflict(
        self,
        field_officer_principal: PrincipalContext,
    ) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyReportingRepository(session)
            incident_repo = SqlAlchemyIncidentRepository(session)
            use_case = SubmitFieldReportUseCase(repo, incident_repo)

            loc = LocationPoint(longitude=91.82, latitude=26.11, accuracy_m=15.0)
            now = datetime.now(timezone.utc)
            op_id = f"op_idemp_{uuid.uuid4().hex[:8]}"

            # 1. First submission
            first_report = await use_case.execute(
                principal=field_officer_principal,
                report_type=ReportType.FLOODING,
                severity=ReportSeverity.MEDIUM,
                description="Waterlogging on access road",
                location=loc,
                observed_at=now,
                client_operation_id=op_id,
            )
            await session.commit()

            # 2. Identical replay returns cached report
            replayed = await use_case.execute(
                principal=field_officer_principal,
                report_type=ReportType.FLOODING,
                severity=ReportSeverity.MEDIUM,
                description="Waterlogging on access road",
                location=loc,
                observed_at=now,
                client_operation_id=op_id,
            )
            assert replayed.id == first_report.id

            # 3. Differing payload with same operation key raises DuplicateOperationError
            with pytest.raises(DuplicateOperationError):
                await use_case.execute(
                    principal=field_officer_principal,
                    report_type=ReportType.BRIDGE_COLLAPSE,  # Different type!
                    severity=ReportSeverity.CRITICAL,
                    description="Bridge washed out completely",
                    location=loc,
                    observed_at=now,
                    client_operation_id=op_id,
                )

    async def test_amend_report_creates_immutable_audit(
        self,
        field_officer_principal: PrincipalContext,
    ) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyReportingRepository(session)
            incident_repo = SqlAlchemyIncidentRepository(session)
            submit_use_case = SubmitFieldReportUseCase(repo, incident_repo)
            amend_use_case = AmendReportUseCase(repo, submit_use_case)

            loc = LocationPoint(longitude=91.82, latitude=26.11, accuracy_m=15.0)
            now = datetime.now(timezone.utc)

            orig = await submit_use_case.execute(
                principal=field_officer_principal,
                report_type=ReportType.TREE_FALL,
                severity=ReportSeverity.LOW,
                description="Small tree branch fallen",
                location=loc,
                observed_at=now,
            )
            await session.commit()

            # Submit amendment
            amended = await amend_use_case.execute(
                principal=field_officer_principal,
                original_report_id=orig.id,
                reason="Correction: entire trunk fell across both lanes",
                report_type=ReportType.TREE_FALL,
                severity=ReportSeverity.HIGH,
                description="Entire trunk fell across both lanes, total blockage",
                location=loc,
                observed_at=now,
            )
            await session.commit()

            assert amended.id != orig.id
            assert amended.amendment_of_report_id == orig.id
            assert amended.severity == ReportSeverity.HIGH
