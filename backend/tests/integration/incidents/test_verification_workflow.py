"""
tests/integration/incidents/test_verification_workflow.py — Integration tests for 7-way atomic verification and guards.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from uuid import UUID

import pytest

from app.core.db import AsyncSessionLocal
from app.core.security import PrincipalContext
from app.modules.identity.domain.enums import Capability, OrgKind, Role
from app.modules.incidents.application.verify_report import VerifyReportUseCase
from app.modules.incidents.domain.enums import (
    IncidentLifecycle,
    ReviewDecisionKind,
)
from app.modules.incidents.domain.exceptions import (
    JurisdictionScopeError,
    SelfVerificationForbiddenError,
    VersionConflictError,
)
from app.modules.incidents.infrastructure.repository import SqlAlchemyIncidentRepository
from app.modules.network.application.declare_edge_status import DeclareEdgeStatusUseCase
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository
from app.modules.reporting.application.submit_report import SubmitFieldReportUseCase
from app.modules.reporting.domain.entities import LocationPoint
from app.modules.reporting.domain.enums import (
    LocationProvider,
    ReportSeverity,
    ReportType,
    ReviewState,
)
from app.modules.reporting.infrastructure.repository import SqlAlchemyReportingRepository

USER_FIELD_OFFICER = UUID("d0000005-0000-4000-8000-000000000005")
USER_DISTRICT_VERIFIER = UUID("d0000003-0000-4000-8000-000000000003")
ORG_GOV_ID = UUID("00000000-0000-4000-a000-000000000001")
ORG_FIELD_ID = UUID("00000000-0000-4000-a000-000000000002")

JURIS_KAMRUP = UUID("00000003-0000-4000-8000-000000000001")
JURIS_MEGHALAYA = UUID("00000002-0000-4000-8000-000000000002")


@pytest.fixture
def field_officer_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=USER_FIELD_OFFICER,
        org_id=ORG_FIELD_ID,
        org_name="Assam Field Authority",
        org_kind=OrgKind.FIELD_AUTHORITY,
        role=Role.FIELD_OFFICER,
        capabilities=frozenset([Capability.SUBMIT_REPORT]),
        jurisdiction_ids=frozenset([JURIS_KAMRUP]),
    )


@pytest.fixture
def verifier_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=USER_DISTRICT_VERIFIER,
        org_id=ORG_GOV_ID,
        org_name="Kamrup District Administration",
        org_kind=OrgKind.GOVERNMENT,
        role=Role.DISTRICT_VERIFIER,
        capabilities=frozenset([Capability.VERIFY_REPORT, Capability.VIEW_REPORT_DETAIL]),
        jurisdiction_ids=frozenset([JURIS_KAMRUP]),
    )


class TestVerificationWorkflow:
    async def test_atomic_verification_full_cycle(
        self,
        field_officer_principal: PrincipalContext,
        verifier_principal: PrincipalContext,
    ) -> None:
        async with AsyncSessionLocal() as session:
            reporting_repo = SqlAlchemyReportingRepository(session)
            incident_repo = SqlAlchemyIncidentRepository(session)
            network_repo = SqlAlchemyNetworkRepository(session)
            declare_status_use_case = DeclareEdgeStatusUseCase(network_repo, network_repo)

            submit_use_case = SubmitFieldReportUseCase(reporting_repo, incident_repo)
            verify_use_case = VerifyReportUseCase(
                reporting_repo=reporting_repo,
                incident_repo=incident_repo,
                declare_status_use_case=declare_status_use_case,
            )

            # 1. Field Officer submits report
            loc = LocationPoint(longitude=91.870, latitude=26.065, accuracy_m=10.0)
            now = datetime.now(timezone.utc)
            report = await submit_use_case.execute(
                principal=field_officer_principal,
                report_type=ReportType.LANDSLIDE,
                severity=ReportSeverity.HIGH,
                description="Massive mudslide blocking road near Byrnihat",
                location=loc,
                observed_at=now,
            )
            await session.commit()

            edge_id = report.candidate_edge_id
            assert edge_id is not None

            # 2. Verifier verifies report and confirms incident
            res = await verify_use_case.execute(
                principal=verifier_principal,
                report_id=report.id,
                decision=ReviewDecisionKind.CONFIRM_INCIDENT,
                notes="Verified via live traffic camera and field check",
                affected_edges=[(edge_id, "BOTH", True)],
            )
            await session.commit()

            # 3. Assert seven-way atomic state mutations:
            # - Report review state
            assert res["review_state"] == ReviewState.VERIFIED.value
            assert res["incident_id"] is not None

            # - Review decision recorded
            decisions = await incident_repo.get_review_decisions_for_report(report.id)
            assert len(decisions) >= 1
            assert decisions[-1].decision == ReviewDecisionKind.CONFIRM_INCIDENT

            # - Incident created
            incident = await incident_repo.get_incident_by_id(UUID(res["incident_id"]))
            assert incident is not None
            assert incident.lifecycle == IncidentLifecycle.ACTIVE

            # - Road status projection updated
            current_status = await network_repo.get_current_status(edge_id)
            assert current_status is not None
            assert current_status.status.value in {"BLOCKED", "RESTRICTED"}

            # - Outbox event uses an event_type the impact-evaluator consumer
            #   (app/workers/outbox_dispatcher.py) actually recognizes, so
            #   disruption impact assessment fires downstream. A regression
            #   here (e.g. reverting to an arbitrary label like
            #   "HIGH_SEVERITY_INCIDENT_CREATED") would silently break impact
            #   evaluation for every newly-confirmed incident.
            outbox_events = await incident_repo.get_pending_outbox_events(limit=50)
            matching = [
                e for e in outbox_events if e.payload.get("incident_id") == res["incident_id"]
            ]
            assert matching, "Expected an outbox event for the newly confirmed incident"
            assert matching[-1].event_type == "incident.created"

    async def test_anti_self_verification_rejected(
        self,
        field_officer_principal: PrincipalContext,
    ) -> None:
        async with AsyncSessionLocal() as session:
            reporting_repo = SqlAlchemyReportingRepository(session)
            incident_repo = SqlAlchemyIncidentRepository(session)
            submit_use_case = SubmitFieldReportUseCase(reporting_repo, incident_repo)
            verify_use_case = VerifyReportUseCase(reporting_repo, incident_repo)

            loc = LocationPoint(longitude=91.82, latitude=26.11, accuracy_m=12.0)
            now = datetime.now(timezone.utc)
            report = await submit_use_case.execute(
                principal=field_officer_principal,
                report_type=ReportType.TREE_FALL,
                severity=ReportSeverity.LOW,
                description="Tree on shoulder",
                location=loc,
                observed_at=now,
            )
            await session.commit()

            # Reporter tries to review their own report
            with pytest.raises(SelfVerificationForbiddenError):
                await verify_use_case.execute(
                    principal=field_officer_principal,
                    report_id=report.id,
                    decision=ReviewDecisionKind.CONFIRM_INCIDENT,
                )

    async def test_jurisdiction_scoping_rejected(
        self,
        field_officer_principal: PrincipalContext,
    ) -> None:
        # Verifier with jurisdiction only in Meghalaya, while report is in Kamrup (Assam)
        meghalaya_verifier = PrincipalContext(
            user_id=uuid.uuid4(),
            org_id=ORG_GOV_ID,
            org_name="Meghalaya Administration",
            org_kind=OrgKind.GOVERNMENT,
            role=Role.DISTRICT_VERIFIER,
            capabilities=frozenset([Capability.VERIFY_REPORT]),
            jurisdiction_ids=frozenset([JURIS_MEGHALAYA]),  # Only Meghalaya!
        )

        async with AsyncSessionLocal() as session:
            reporting_repo = SqlAlchemyReportingRepository(session)
            incident_repo = SqlAlchemyIncidentRepository(session)
            submit_use_case = SubmitFieldReportUseCase(reporting_repo, incident_repo)
            verify_use_case = VerifyReportUseCase(reporting_repo, incident_repo)

            loc = LocationPoint(longitude=91.82, latitude=26.11, accuracy_m=12.0)
            now = datetime.now(timezone.utc)
            report = await submit_use_case.execute(
                principal=field_officer_principal,
                report_type=ReportType.FLOODING,
                severity=ReportSeverity.MEDIUM,
                description="Waterlogging in Kamrup",
                location=loc,
                observed_at=now,
            )
            await session.commit()

            # Attempt adjudication outside jurisdiction
            with pytest.raises(JurisdictionScopeError, match="lacks jurisdiction scope"):
                await verify_use_case.execute(
                    principal=meghalaya_verifier,
                    report_id=report.id,
                    decision=ReviewDecisionKind.CONFIRM_INCIDENT,
                )

    async def test_optimistic_concurrency_conflict(
        self,
        field_officer_principal: PrincipalContext,
        verifier_principal: PrincipalContext,
    ) -> None:
        async with AsyncSessionLocal() as session:
            reporting_repo = SqlAlchemyReportingRepository(session)
            incident_repo = SqlAlchemyIncidentRepository(session)
            submit_use_case = SubmitFieldReportUseCase(reporting_repo, incident_repo)
            verify_use_case = VerifyReportUseCase(reporting_repo, incident_repo)

            loc = LocationPoint(longitude=91.82, latitude=26.11, accuracy_m=12.0)
            now = datetime.now(timezone.utc)
            report = await submit_use_case.execute(
                principal=field_officer_principal,
                report_type=ReportType.ROAD_DAMAGE,
                severity=ReportSeverity.LOW,
                description="Potholes",
                location=loc,
                observed_at=now,
            )
            await session.commit()

            # Provide stale If-Match version (current version is 1, client sends 99)
            with pytest.raises(VersionConflictError):
                await verify_use_case.execute(
                    principal=verifier_principal,
                    report_id=report.id,
                    decision=ReviewDecisionKind.REJECT_REPORT,
                    rejection_reason="SPAM_OR_INVALID",
                    if_match_version=99,
                )
