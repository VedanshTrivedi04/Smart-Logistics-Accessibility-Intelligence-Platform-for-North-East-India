"""
tests/integration/reporting/test_media_presigned_pipeline.py — Integration tests for media upload and download pipeline.
"""

from __future__ import annotations

import uuid
from uuid import UUID

import pytest

from app.core.db import AsyncSessionLocal
from app.core.exceptions import ForbiddenError
from app.core.security import PrincipalContext
from app.modules.identity.domain.enums import Capability, OrgKind, Role
from app.modules.reporting.application.media_service import MediaUploadService
from app.modules.reporting.domain.enums import ScanStatus
from app.modules.reporting.infrastructure.repository import SqlAlchemyReportingRepository

USER_FIELD_OFFICER = UUID("d0000005-0000-4000-8000-000000000005")
ORG_FIELD_ID = UUID("00000000-0000-4000-a000-000000000002")


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
            Capability.VIEW_REPORT_MEDIA,
        ]),
    )


@pytest.fixture
def unauthorized_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=uuid.uuid4(),
        org_id=ORG_FIELD_ID,
        org_name="Assam Field Authority",
        org_kind=OrgKind.FIELD_AUTHORITY,
        role=Role.LOCAL_AUTHORITY,
        capabilities=frozenset([Capability.VIEW_REPORT_SUMMARY]),  # Lacks VIEW_REPORT_MEDIA
    )


class TestMediaPresignedPipeline:
    async def test_presigned_upload_and_confirmation(
        self,
        field_officer_principal: PrincipalContext,
    ) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyReportingRepository(session)
            service = MediaUploadService(repo)

            # 1. Request upload ticket
            ticket = await service.request_upload_ticket(
                principal=field_officer_principal,
                file_name="rockfall_site_01.jpg",
                file_size_bytes=1024 * 500,  # 500 KB
                mime_type="image/jpeg",
                checksum_sha256="b1c2d3e4f5a60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
            )
            await session.commit()

            media_id = UUID(str(ticket["media_id"]))
            assert "upload_url" in ticket
            assert ticket["expires_in_seconds"] == 900

            # 2. Confirm upload
            confirmed = await service.confirm_upload(
                media_id=media_id,
                width_px=1920,
                height_px=1080,
                exif_lat=26.05,
                exif_lon=91.98,
            )
            await session.commit()

            assert confirmed.scan_status == ScanStatus.CLEAN
            assert confirmed.width_px == 1920

            # 3. Authorized download URL generation
            download_url = await service.generate_download_url(media_id, field_officer_principal)
            assert download_url is not None

    async def test_unauthorized_download_denied(
        self,
        field_officer_principal: PrincipalContext,
        unauthorized_principal: PrincipalContext,
    ) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyReportingRepository(session)
            service = MediaUploadService(repo)

            ticket = await service.request_upload_ticket(
                principal=field_officer_principal,
                file_name="bridge_scour.png",
                file_size_bytes=200000,
                mime_type="image/png",
                checksum_sha256="c1c2d3e4f5a60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
            )
            await session.commit()
            media_id = UUID(str(ticket["media_id"]))

            with pytest.raises(ForbiddenError, match="Principal lacks VIEW_REPORT_MEDIA capability"):
                await service.generate_download_url(media_id, unauthorized_principal)
