"""
tests/unit/inspection/test_inspection_lifecycle.py — Unit tests for inspection module.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.modules.identity.domain.principal import PrincipalContext
from app.modules.identity.domain.enums import Capability, OrgKind, Role
from app.modules.inspection.application.ports import InspectionRepositoryPort
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
    InspectionPriority,
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
from app.modules.reporting.domain.enums import ScanStatus


@pytest.fixture
def coordinator_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        org_name="Kamrup District Admin",
        org_kind=OrgKind.GOVERNMENT,
        role=Role.DISTRICT_VERIFIER,
        capabilities=frozenset([
            Capability.ASSIGN_INSPECTION,
            Capability.VERIFY_REPORT,
            Capability.VIEW_REPORT_SUMMARY,
        ]),
    )


@pytest.fixture
def inspector_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=uuid.UUID("d0000007-0000-4000-8000-000000000007"),
        org_id=uuid.uuid4(),
        org_name="NER PWD Inspection Wing",
        org_kind=OrgKind.FIELD_AUTHORITY,
        role=Role.ROAD_INSPECTION,
        capabilities=frozenset([
            Capability.CONDUCT_INSPECTION,
            Capability.VERIFY_REPORT,
            Capability.VIEW_REPORT_SUMMARY,
            Capability.VIEW_REPORT_DETAIL,
            Capability.VIEW_REPORT_MEDIA,
        ]),
    )


class MockInspectionRepo(InspectionRepositoryPort):
    def __init__(self) -> None:
        self.inspections: dict[uuid.UUID, Inspection] = {}
        self.evidence: list[InspectionEvidence] = []

    async def create_inspection(self, inspection: Inspection) -> Inspection:
        self.inspections[inspection.id] = inspection
        return inspection

    async def get_inspection_by_id(self, inspection_id: uuid.UUID) -> Inspection | None:
        return self.inspections.get(inspection_id)

    async def update_inspection(self, inspection: Inspection) -> Inspection:
        self.inspections[inspection.id] = inspection
        return inspection

    async def list_inspections(self, **kwargs) -> list[Inspection]:
        assigned_to = kwargs.get("assigned_to")
        status = kwargs.get("status")
        res = list(self.inspections.values())
        if assigned_to:
            res = [i for i in res if i.assigned_to == assigned_to]
        if status:
            res = [i for i in res if i.status == status]
        return res

    async def count_by_status(self, **kwargs) -> dict[str, int]:
        assigned_to = kwargs.get("assigned_to")
        res = list(self.inspections.values())
        if assigned_to:
            res = [i for i in res if i.assigned_to == assigned_to]
        counts = {s.value: 0 for s in InspectionStatus}
        for i in res:
            counts[i.status.value] += 1
        return counts

    async def add_evidence(self, evidence: InspectionEvidence) -> InspectionEvidence:
        self.evidence.append(evidence)
        return evidence

    async def get_latest_inspection_for_edge(self, edge_id: str) -> Inspection | None:
        matching = [i for i in self.inspections.values() if i.candidate_edge_id == edge_id]
        return matching[-1] if matching else None

    async def list_available_inspectors(self):
        return []


class TestInspectionLifecycle:
    async def test_assign_inspection_by_coordinator(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        use_case = AssignInspectionUseCase(repo)

        inspection = await use_case.execute(
            principal=coordinator_principal,
            jurisdiction_id=uuid.uuid4(),
            assigned_to=inspector_principal.user_id,
            priority=InspectionPriority.CRITICAL,
            instructions="Inspect bridge pier cracks on NH-6 immediately",
            candidate_edge_id="edge_nh6_kamrup_01",
        )

        assert inspection.status == InspectionStatus.ASSIGNED
        assert inspection.priority == InspectionPriority.CRITICAL
        assert inspection.assigned_to == inspector_principal.user_id
        assert inspection.instructions == "Inspect bridge pier cracks on NH-6 immediately"

    async def test_inspector_starts_inspection(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        assign_uc = AssignInspectionUseCase(repo)
        start_uc = StartInspectionUseCase(repo)

        insp = await assign_uc.execute(
            principal=coordinator_principal,
            jurisdiction_id=uuid.uuid4(),
            assigned_to=inspector_principal.user_id,
        )

        started = await start_uc.execute(insp.id, inspector_principal)
        assert started.status == InspectionStatus.IN_PROGRESS
        assert started.started_at is not None

    async def test_other_inspector_cannot_start_unassigned_inspection(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        assign_uc = AssignInspectionUseCase(repo)
        start_uc = StartInspectionUseCase(repo)

        insp = await assign_uc.execute(
            principal=coordinator_principal,
            jurisdiction_id=uuid.uuid4(),
            assigned_to=inspector_principal.user_id,
        )

        imposter = PrincipalContext(
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            org_name="Another Org",
            org_kind=OrgKind.FIELD_AUTHORITY,
            role=Role.ROAD_INSPECTION,
            capabilities=frozenset([Capability.CONDUCT_INSPECTION]),
        )

        with pytest.raises(InspectionAssignmentError):
            await start_uc.execute(insp.id, imposter)

    async def test_submit_technical_assessment(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        assign_uc = AssignInspectionUseCase(repo)
        start_uc = StartInspectionUseCase(repo)
        assessment_uc = SubmitInspectionAssessmentUseCase(repo)

        insp = await assign_uc.execute(
            principal=coordinator_principal,
            jurisdiction_id=uuid.uuid4(),
            assigned_to=inspector_principal.user_id,
        )
        await start_uc.execute(insp.id, inspector_principal)

        assessment = TechnicalAssessment(
            road_condition="Severe landslide debris over 35m section",
            passability=PassabilityStatus.IMPASSABLE,
            damage_type=DamageType.LANDSLIDE,
            stability=StructuralStability.MONITORING_REQUIRED,
            affected_length_m=35.0,
            affected_width_m=7.5,
            debris_depth_m=1.8,
            slope_movement_detected=True,
            heavy_vehicle_passable=False,
            recommended_speed_limit_kmh=0,
            technical_notes="Active mud flow, heavy rocks blocking entire road width",
        )

        evidence = [
            InspectionEvidence(
                id=uuid.uuid4(),
                inspection_id=insp.id,
                media_id=uuid.uuid4(),
                kind=EvidenceKind.WIDE_ANGLE,
                caption="Corridor blockage from south approach",
            )
        ]

        updated = await assessment_uc.execute(insp.id, inspector_principal, assessment, evidence)
        assert updated.assessment is not None
        assert updated.assessment.affected_length_m == 35.0
        assert len(repo.evidence) == 1

    async def test_anti_self_verification_raises_error_if_inspector_is_reporter(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        mock_reporting_repo = AsyncMock()
        report_mock = AsyncMock()
        report_mock.reporter_id = inspector_principal.user_id
        mock_reporting_repo.get_report_by_id.return_value = report_mock

        assign_uc = AssignInspectionUseCase(repo)
        decide_uc = DecideInspectionUseCase(repo, mock_reporting_repo)

        insp = await assign_uc.execute(
            principal=coordinator_principal,
            jurisdiction_id=uuid.uuid4(),
            assigned_to=inspector_principal.user_id,
            report_id=uuid.uuid4(),
        )

        with pytest.raises(SelfInspectionForbiddenError):
            await decide_uc.execute(
                inspection_id=insp.id,
                principal=inspector_principal,
                decision="VERIFIED",
            )

    async def test_decide_inspection_clearance_restored(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        mock_reporting_repo = AsyncMock()
        mock_declare_status = AsyncMock()

        assign_uc = AssignInspectionUseCase(repo)
        start_uc = StartInspectionUseCase(repo)
        decide_uc = DecideInspectionUseCase(
            repo,
            mock_reporting_repo,
            declare_status_use_case=mock_declare_status,
        )

        insp = await assign_uc.execute(
            principal=coordinator_principal,
            jurisdiction_id=uuid.uuid4(),
            assigned_to=inspector_principal.user_id,
            candidate_edge_id="edge_nh6_clearance_01",
        )
        await start_uc.execute(insp.id, inspector_principal)

        res = await decide_uc.execute(
            inspection_id=insp.id,
            principal=inspector_principal,
            decision="CLEARANCE_RESTORED",
            notes="Debris cleared, both lanes open to all traffic",
        )

        assert res["decision"] == "CLEARANCE_RESTORED"
        assert insp.status == InspectionStatus.COMPLETED
        assert insp.final_decision == "CLEARANCE_RESTORED"
        assert mock_declare_status.execute.called


class TestAssignmentScoping:
    """
    Regression tests for the bug where DecideInspectionUseCase's bypass check used
    Capability.VERIFY_REPORT — a capability every ROAD_INSPECTION principal holds by default —
    instead of a supervisor capability. That let any inspector decide any other inspector's
    assigned task.
    """

    async def test_an_unassigned_inspector_cannot_decide_someone_elses_inspection(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        mock_reporting_repo = AsyncMock()
        assign_uc = AssignInspectionUseCase(repo)
        start_uc = StartInspectionUseCase(repo)
        decide_uc = DecideInspectionUseCase(repo, mock_reporting_repo)

        insp = await assign_uc.execute(
            principal=coordinator_principal,
            jurisdiction_id=uuid.uuid4(),
            assigned_to=inspector_principal.user_id,
            candidate_edge_id="edge_nh6_scoping_01",
        )
        await start_uc.execute(insp.id, inspector_principal)

        another_inspector = PrincipalContext(
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            org_name="Another Inspection Wing",
            org_kind=OrgKind.FIELD_AUTHORITY,
            role=Role.ROAD_INSPECTION,
            # A second inspector holds the same baseline capabilities as any ROAD_INSPECTION principal,
            # including VERIFY_REPORT — this is exactly the set that used to bypass the assignment check.
            capabilities=frozenset([Capability.CONDUCT_INSPECTION, Capability.VERIFY_REPORT]),
        )

        with pytest.raises(InspectionAssignmentError):
            await decide_uc.execute(inspection_id=insp.id, principal=another_inspector, decision="VERIFIED")

    async def test_a_supervisor_can_decide_any_inspectors_task(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        mock_reporting_repo = AsyncMock()
        assign_uc = AssignInspectionUseCase(repo)
        start_uc = StartInspectionUseCase(repo)
        decide_uc = DecideInspectionUseCase(repo, mock_reporting_repo)

        insp = await assign_uc.execute(
            principal=coordinator_principal,
            jurisdiction_id=uuid.uuid4(),
            assigned_to=inspector_principal.user_id,
            candidate_edge_id="edge_nh6_scoping_02",
        )
        await start_uc.execute(insp.id, inspector_principal)

        res = await decide_uc.execute(inspection_id=insp.id, principal=coordinator_principal, decision="REJECTED", rejection_reason="UNVERIFIABLE")
        assert res["decision"] == "REJECTED"

    async def test_unrelated_principal_cannot_view_inspection_detail(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        assign_uc = AssignInspectionUseCase(repo)
        detail_uc = GetInspectionDetailUseCase(repo)

        insp = await assign_uc.execute(
            principal=coordinator_principal,
            jurisdiction_id=uuid.uuid4(),
            assigned_to=inspector_principal.user_id,
        )

        stranger = PrincipalContext(
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            org_name="Unrelated Org",
            org_kind=OrgKind.LOGISTICS,
            role=Role.TRANSPORT_OPERATOR,
            capabilities=frozenset([Capability.SUBMIT_GPS, Capability.VIEW_ROAD_STATUS]),
        )

        with pytest.raises(InspectionNotFoundError):
            await detail_uc.execute(insp.id, stranger)

        # The assigned inspector and the assigning supervisor can both still see it.
        assert (await detail_uc.execute(insp.id, inspector_principal)).id == insp.id
        assert (await detail_uc.execute(insp.id, coordinator_principal)).id == insp.id

    async def test_latest_edge_inspection_is_scoped_the_same_way(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        assign_uc = AssignInspectionUseCase(repo)
        latest_uc = GetLatestEdgeInspectionUseCase(repo)

        await assign_uc.execute(
            principal=coordinator_principal,
            jurisdiction_id=uuid.uuid4(),
            assigned_to=inspector_principal.user_id,
            candidate_edge_id="edge_nh6_scoping_03",
        )

        stranger = PrincipalContext(
            user_id=uuid.uuid4(), org_id=uuid.uuid4(), org_name="Unrelated Org", org_kind=OrgKind.LOGISTICS,
            role=Role.TRANSPORT_OPERATOR, capabilities=frozenset([Capability.VIEW_ROAD_STATUS]),
        )
        assert await latest_uc.execute("edge_nh6_scoping_03", stranger) is None
        assert (await latest_uc.execute("edge_nh6_scoping_03", inspector_principal)).candidate_edge_id == "edge_nh6_scoping_03"


class TestEvidenceMediaValidation:
    """
    Regression tests for the bug where a photo's media_id was never checked before being linked as
    evidence: a fake or foreign media_id reached the database and failed as a raw foreign-key error
    instead of a clean, reportable validation error.
    """

    def _assessment(self) -> TechnicalAssessment:
        return TechnicalAssessment(
            road_condition="Test", passability=PassabilityStatus.IMPASSABLE, damage_type=DamageType.LANDSLIDE,
        )

    async def test_a_photo_that_was_never_uploaded_is_rejected(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        reporting_repo = AsyncMock()
        reporting_repo.get_media_by_id.return_value = None
        assign_uc = AssignInspectionUseCase(repo)
        assessment_uc = SubmitInspectionAssessmentUseCase(repo, reporting_repo)

        insp = await assign_uc.execute(principal=coordinator_principal, jurisdiction_id=uuid.uuid4(), assigned_to=inspector_principal.user_id)
        evidence = [InspectionEvidence(id=uuid.uuid4(), inspection_id=insp.id, media_id=uuid.uuid4(), kind=EvidenceKind.WIDE_ANGLE)]

        with pytest.raises(InspectionValidationError):
            await assessment_uc.execute(insp.id, inspector_principal, self._assessment(), evidence)

    async def test_a_photo_uploaded_by_someone_else_is_rejected(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        reporting_repo = AsyncMock()
        media = AsyncMock()
        media.uploader_id = uuid.uuid4()  # not the inspector
        media.scan_status = ScanStatus.CLEAN
        reporting_repo.get_media_by_id.return_value = media
        assign_uc = AssignInspectionUseCase(repo)
        assessment_uc = SubmitInspectionAssessmentUseCase(repo, reporting_repo)

        insp = await assign_uc.execute(principal=coordinator_principal, jurisdiction_id=uuid.uuid4(), assigned_to=inspector_principal.user_id)
        evidence = [InspectionEvidence(id=uuid.uuid4(), inspection_id=insp.id, media_id=uuid.uuid4(), kind=EvidenceKind.WIDE_ANGLE)]

        with pytest.raises(InspectionValidationError):
            await assessment_uc.execute(insp.id, inspector_principal, self._assessment(), evidence)

    async def test_a_clean_photo_uploaded_by_the_inspector_is_accepted(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        reporting_repo = AsyncMock()
        media = AsyncMock()
        media.uploader_id = inspector_principal.user_id
        media.scan_status = ScanStatus.CLEAN
        reporting_repo.get_media_by_id.return_value = media
        assign_uc = AssignInspectionUseCase(repo)
        assessment_uc = SubmitInspectionAssessmentUseCase(repo, reporting_repo)

        insp = await assign_uc.execute(principal=coordinator_principal, jurisdiction_id=uuid.uuid4(), assigned_to=inspector_principal.user_id)
        evidence = [InspectionEvidence(id=uuid.uuid4(), inspection_id=insp.id, media_id=uuid.uuid4(), kind=EvidenceKind.WIDE_ANGLE)]

        updated = await assessment_uc.execute(insp.id, inspector_principal, self._assessment(), evidence)
        assert len(repo.evidence) == 1
        assert updated.assessment is not None


class TestMoreInfoDecision:
    async def test_more_info_needed_calls_verify_report_and_keeps_the_task_open(
        self, coordinator_principal: PrincipalContext, inspector_principal: PrincipalContext
    ) -> None:
        repo = MockInspectionRepo()
        mock_reporting_repo = AsyncMock()
        mock_verify = AsyncMock()
        mock_verify.execute.return_value = {"review_state": "MORE_INFO_NEEDED"}
        assign_uc = AssignInspectionUseCase(repo)
        start_uc = StartInspectionUseCase(repo)
        decide_uc = DecideInspectionUseCase(repo, mock_reporting_repo, verify_report_use_case=mock_verify)

        insp = await assign_uc.execute(
            principal=coordinator_principal, jurisdiction_id=uuid.uuid4(),
            assigned_to=inspector_principal.user_id, report_id=uuid.uuid4(),
        )
        await start_uc.execute(insp.id, inspector_principal)

        res = await decide_uc.execute(inspection_id=insp.id, principal=inspector_principal, decision="MORE_INFO_NEEDED", notes="Need a wider shot of the pier base")
        assert res["verification"]["review_state"] == "MORE_INFO_NEEDED"
        assert insp.status == InspectionStatus.REINSPECTION_REQUIRED
        assert insp.status != InspectionStatus.COMPLETED
