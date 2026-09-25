"""
tests/unit/reporting/test_report_access.py — Who may see a report or its photos.

The database has no row-level security on these tables, so this policy is the isolation boundary.
"""

from __future__ import annotations

import importlib
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest

from app.core.exceptions import ForbiddenError
from app.core.storage import MockStorageService
from app.modules.identity.domain.enums import Capability, OrgKind, Role
from app.modules.identity.domain.principal import PrincipalContext
from app.modules.reporting.application.access import ReportScope, can_view_report, scope_for
from app.modules.reporting.application.media_service import MediaUploadService
from app.modules.reporting.application.submit_report import SubmitFieldReportUseCase
from app.modules.reporting.domain.entities import MediaObject
from app.modules.reporting.domain.enums import ScanStatus
from app.modules.reporting.domain.exceptions import MediaNotFoundError, ReportNotFoundError

reporting_router = importlib.import_module("app.modules.reporting.api.router")

DISTRICT = uuid.uuid4()
OTHER_DISTRICT = uuid.uuid4()
STATE = uuid.uuid4()


def principal(role: Role = Role.DISTRICT_VERIFIER, *, caps: set[Capability] | None = None, jurisdictions: set[uuid.UUID] | None = None, region_wide: bool = False, user_id: uuid.UUID | None = None) -> PrincipalContext:
    return PrincipalContext(
        user_id=user_id or uuid.uuid4(),
        org_id=uuid.uuid4(),
        org_name="Org",
        org_kind=OrgKind.GOVERNMENT,
        role=role,
        capabilities=frozenset(caps or set()),
        jurisdiction_ids=frozenset(jurisdictions or set()),
        region_wide=region_wide,
    )


class TestVisibilityPolicy:
    def test_reporter_always_sees_their_own(self) -> None:
        me = uuid.uuid4()
        assert can_view_report(ReportScope(user_id=me), me, OTHER_DISTRICT)
        assert can_view_report(ReportScope(user_id=me), me, None)

    def test_no_grants_means_own_reports_only(self) -> None:
        scope = ReportScope(user_id=uuid.uuid4())
        assert not can_view_report(scope, uuid.uuid4(), DISTRICT)
        assert not can_view_report(scope, uuid.uuid4(), None)

    def test_jurisdiction_grant_covers_its_reports_only(self) -> None:
        scope = ReportScope(user_id=uuid.uuid4(), jurisdiction_ids=frozenset({DISTRICT}))
        assert can_view_report(scope, uuid.uuid4(), DISTRICT)
        assert not can_view_report(scope, uuid.uuid4(), OTHER_DISTRICT)
        assert not can_view_report(scope, uuid.uuid4(), None)

    def test_region_wide_also_sees_unassigned_reports(self) -> None:
        scope = ReportScope(user_id=uuid.uuid4(), jurisdiction_ids=frozenset({DISTRICT}), include_unassigned=True)
        assert can_view_report(scope, uuid.uuid4(), None)

    def test_platform_admin_sees_everything(self) -> None:
        scope = scope_for(principal(Role.PLATFORM_ADMINISTRATOR))
        assert can_view_report(scope, uuid.uuid4(), OTHER_DISTRICT)
        assert can_view_report(scope, uuid.uuid4(), None)

    def test_scope_is_built_from_the_principal(self) -> None:
        p = principal(jurisdictions={DISTRICT, STATE}, region_wide=True)
        s = scope_for(p)
        assert s.user_id == p.user_id
        assert s.jurisdiction_ids == frozenset({DISTRICT, STATE})
        assert s.include_unassigned is True
        assert s.unrestricted is False


class FakeRepo:
    def __init__(self) -> None:
        self.reports: dict[uuid.UUID, Any] = {}
        self.media: dict[uuid.UUID, MediaObject] = {}
        self.attached: dict[uuid.UUID, list[Any]] = {}
        self.scan_updates: list[uuid.UUID] = []

    async def get_report_by_id(self, report_id: uuid.UUID) -> Any:
        return self.reports.get(report_id)

    async def get_media_by_id(self, media_id: uuid.UUID) -> MediaObject | None:
        return self.media.get(media_id)

    async def list_reports_for_media(self, media_id: uuid.UUID) -> list[Any]:
        return self.attached.get(media_id, [])

    async def update_media_scan(self, media_id: uuid.UUID, **_: Any) -> None:
        self.scan_updates.append(media_id)


def media_owned_by(uploader: uuid.UUID) -> MediaObject:
    return MediaObject(
        id=uuid.uuid4(),
        uploader_id=uploader,
        bucket="b",
        object_key="quarantine/x.jpg",
        file_name="x.jpg",
        file_size_bytes=10,
        mime_type="image/jpeg",
        checksum_sha256="a" * 64,
        scan_status=ScanStatus.PENDING_SCAN,
        created_at=datetime.now(UTC),
    )


def report_stub(reporter: uuid.UUID, jurisdiction: uuid.UUID | None) -> Any:
    return SimpleNamespace(id=uuid.uuid4(), reporter_id=reporter, jurisdiction_id=jurisdiction)


class TestMediaAccess:
    async def test_uploader_can_download_their_own_photo_without_the_capability(self) -> None:
        me = principal(Role.FIELD_OFFICER, caps={Capability.SUBMIT_REPORT})
        repo = FakeRepo()
        m = media_owned_by(me.user_id)
        repo.media[m.id] = m
        svc = MediaUploadService(repo, MockStorageService())  # type: ignore[arg-type]
        assert (await svc.generate_download_url(m.id, me)).startswith("http")

    async def test_other_users_need_the_capability(self) -> None:
        repo = FakeRepo()
        m = media_owned_by(uuid.uuid4())
        repo.media[m.id] = m
        svc = MediaUploadService(repo, MockStorageService())  # type: ignore[arg-type]
        with pytest.raises(ForbiddenError):
            await svc.generate_download_url(m.id, principal(caps=set()))

    async def test_capability_alone_is_not_enough_outside_the_jurisdiction(self) -> None:
        repo = FakeRepo()
        m = media_owned_by(uuid.uuid4())
        repo.media[m.id] = m
        repo.attached[m.id] = [report_stub(m.uploader_id, OTHER_DISTRICT)]
        svc = MediaUploadService(repo, MockStorageService())  # type: ignore[arg-type]
        verifier = principal(caps={Capability.VIEW_REPORT_MEDIA}, jurisdictions={DISTRICT})
        with pytest.raises(MediaNotFoundError):
            await svc.generate_download_url(m.id, verifier)

    async def test_capability_inside_the_jurisdiction_is_allowed(self) -> None:
        repo = FakeRepo()
        m = media_owned_by(uuid.uuid4())
        repo.media[m.id] = m
        repo.attached[m.id] = [report_stub(m.uploader_id, DISTRICT)]
        svc = MediaUploadService(repo, MockStorageService())  # type: ignore[arg-type]
        verifier = principal(caps={Capability.VIEW_REPORT_MEDIA}, jurisdictions={DISTRICT})
        assert (await svc.generate_download_url(m.id, verifier)).startswith("http")

    async def test_unattached_photo_is_visible_to_its_uploader_only(self) -> None:
        repo = FakeRepo()
        m = media_owned_by(uuid.uuid4())
        repo.media[m.id] = m
        svc = MediaUploadService(repo, MockStorageService())  # type: ignore[arg-type]
        with pytest.raises(MediaNotFoundError):
            await svc.generate_download_url(m.id, principal(caps={Capability.VIEW_REPORT_MEDIA}, jurisdictions={DISTRICT}))

    async def test_only_the_uploader_can_confirm(self) -> None:
        repo = FakeRepo()
        m = media_owned_by(uuid.uuid4())
        repo.media[m.id] = m
        svc = MediaUploadService(repo, MockStorageService())  # type: ignore[arg-type]
        with pytest.raises(MediaNotFoundError):
            await svc.confirm_upload(m.id, uploader_id=uuid.uuid4())
        assert repo.scan_updates == []


class TestSubmitOwnership:
    async def test_report_cannot_carry_someone_elses_photo(self) -> None:
        class Repo(FakeRepo):
            async def find_by_client_operation_id(self, *_: Any) -> None:
                return None

            async def find_candidate_edges(self, **_: Any) -> list[Any]:
                return []

            async def find_candidate_bridges(self, **_: Any) -> list[Any]:
                return []

        repo = Repo()
        foreign = media_owned_by(uuid.uuid4())
        repo.media[foreign.id] = foreign
        officer = principal(Role.FIELD_OFFICER, caps={Capability.SUBMIT_REPORT})
        from app.modules.reporting.domain.entities import LocationPoint
        from app.modules.reporting.domain.enums import ReportSeverity, ReportType

        with pytest.raises(MediaNotFoundError):
            await SubmitFieldReportUseCase(repo).execute(  # type: ignore[arg-type]
                principal=officer,
                report_type=ReportType.LANDSLIDE,
                severity=ReportSeverity.HIGH,
                description="rocks on road",
                location=LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=10.0),
                observed_at=datetime.now(UTC),
                media_ids=[foreign.id],
            )


class TestReportDetailEndpoint:
    async def _get(self, repo: Any, who: PrincipalContext, report_id: uuid.UUID) -> Any:
        # The handler builds its own repository from the session, so swap in the fake.
        orig = reporting_router.SqlAlchemyReportingRepository
        reporting_router.SqlAlchemyReportingRepository = lambda _db: repo
        try:
            return await reporting_router.get_report_detail(report_id, db=None, principal=who)  # type: ignore[arg-type]
        finally:
            reporting_router.SqlAlchemyReportingRepository = orig

    def _report(self, reporter: uuid.UUID, jurisdiction: uuid.UUID | None) -> Any:
        now = datetime.now(UTC)
        from app.modules.reporting.domain.entities import FieldReport, LocationPoint
        from app.modules.reporting.domain.enums import ReportSeverity, ReportType

        return FieldReport(
            id=uuid.uuid4(),
            reporter_id=reporter,
            report_type=ReportType.LANDSLIDE,
            severity=ReportSeverity.HIGH,
            description="rocks",
            location=LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=10.0),
            observed_at=now,
            received_at=now,
            created_at=now,
            jurisdiction_id=jurisdiction,
        )

    async def test_owner_reads_own_report_without_the_detail_capability(self) -> None:
        me = principal(Role.FIELD_OFFICER, caps={Capability.SUBMIT_REPORT})
        r = self._report(me.user_id, DISTRICT)
        repo = FakeRepo()
        repo.reports[r.id] = r
        got = await self._get(repo, me, r.id)
        assert got.id == r.id

    async def test_other_field_officer_gets_not_found(self) -> None:
        r = self._report(uuid.uuid4(), DISTRICT)
        repo = FakeRepo()
        repo.reports[r.id] = r
        stranger = principal(Role.FIELD_OFFICER, caps={Capability.SUBMIT_REPORT, Capability.VIEW_REPORT_SUMMARY})
        with pytest.raises(ReportNotFoundError):
            await self._get(repo, stranger, r.id)

    async def test_verifier_outside_the_jurisdiction_gets_not_found(self) -> None:
        r = self._report(uuid.uuid4(), OTHER_DISTRICT)
        repo = FakeRepo()
        repo.reports[r.id] = r
        verifier = principal(caps={Capability.VIEW_REPORT_DETAIL}, jurisdictions={DISTRICT})
        with pytest.raises(ReportNotFoundError):
            await self._get(repo, verifier, r.id)

    async def test_verifier_inside_the_jurisdiction_can_read(self) -> None:
        r = self._report(uuid.uuid4(), DISTRICT)
        repo = FakeRepo()
        repo.reports[r.id] = r
        verifier = principal(caps={Capability.VIEW_REPORT_DETAIL}, jurisdictions={DISTRICT})
        assert (await self._get(repo, verifier, r.id)).id == r.id

    async def test_missing_report_looks_the_same_as_forbidden(self) -> None:
        with pytest.raises(ReportNotFoundError):
            await self._get(FakeRepo(), principal(caps={Capability.VIEW_REPORT_DETAIL}), uuid.uuid4())
