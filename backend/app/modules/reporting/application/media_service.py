"""
app/modules/reporting/application/media_service.py — Media Pre-signed Upload & Scan Pipeline.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.config import get_settings
from app.core.exceptions import ForbiddenError
from app.core.security import PrincipalContext
from app.core.storage import ObjectStoragePort, get_storage_service
from app.modules.identity.domain.enums import Capability
from app.modules.reporting.application.access import can_view_report, scope_for
from app.modules.reporting.application.ports import (
    MalwareScannerPort,
    MediaInspectorPort,
    MediaRejectedError,
    ReportingRepositoryPort,
)
from app.modules.reporting.domain.entities import MediaObject
from app.modules.reporting.domain.enums import ScanStatus
from app.modules.reporting.domain.exceptions import (
    MediaNotFoundError,
    MediaStorageUnavailableError,
    MediaValidationError,
)


def _default_inspector() -> MediaInspectorPort:
    from app.modules.reporting.infrastructure.media_inspector import PillowMediaInspector

    return PillowMediaInspector()


def _default_scanner(settings: Any) -> MalwareScannerPort | None:
    host = getattr(settings, "CLAMAV_HOST", "")
    if not host:
        return None
    from app.modules.reporting.infrastructure.clamav_scanner import ClamAvScanner

    return ClamAvScanner(host, getattr(settings, "CLAMAV_PORT", 3310))


class MediaUploadService:
    """Orchestrates pre-signed direct S3 uploads, quarantine scanning, and download URLs."""

    def __init__(
        self,
        reporting_repo: ReportingRepositoryPort,
        storage_service: ObjectStoragePort | None = None,
        inspector: MediaInspectorPort | None = None,
        scanner: MalwareScannerPort | None = None,
    ) -> None:
        self.reporting_repo = reporting_repo
        self.storage = storage_service or get_storage_service()
        self.settings = get_settings()
        self.inspector = inspector or _default_inspector()
        self.scanner = scanner if scanner is not None else _default_scanner(self.settings)

    async def request_upload_ticket(
        self,
        principal: PrincipalContext,
        file_name: str,
        file_size_bytes: int,
        mime_type: str,
        checksum_sha256: str,
    ) -> dict[str, Any]:
        """Validate media metadata and issue a direct-upload ticket (presigned PUT, or signed POST for Cloudinary)."""
        # 1. MIME Whitelist
        allowed_mimes = {"image/jpeg", "image/png", "image/webp"}
        if mime_type not in allowed_mimes:
            raise MediaValidationError(f"MIME type '{mime_type}' not permitted. Must be one of {allowed_mimes}")

        # 2. Size limit (10MB)
        max_bytes = 10 * 1024 * 1024
        if file_size_bytes <= 0 or file_size_bytes > max_bytes:
            raise MediaValidationError(f"File size {file_size_bytes} exceeds limit of {max_bytes} bytes (10MB)")

        # 3. SHA-256 validation
        if not re.match(r"^[a-fA-F0-9]{64}$", checksum_sha256):
            raise MediaValidationError("Invalid SHA-256 checksum format.")

        # 4. Generate object key in quarantine
        media_id = uuid.uuid4()
        now = datetime.now(UTC)
        sanitized_ext = mime_type.split("/")[-1]
        if sanitized_ext == "jpeg":
            sanitized_ext = "jpg"
        object_key = f"quarantine/{now.year}/{now.month:02d}/{media_id}.{sanitized_ext}"
        bucket = getattr(self.settings, "OBJECT_STORAGE_BUCKET_QUARANTINE", "ner-media-quarantine")

        # 5. Generate Presigned PUT URL
        expires_in = 900  # 15 minutes
        target = await self.storage.create_upload_target(
            bucket=bucket,
            object_key=object_key,
            content_type=mime_type,
            expires_in_seconds=expires_in,
        )

        # 6. Save media object record
        media = MediaObject(
            id=media_id,
            uploader_id=principal.user_id,
            bucket=bucket,
            object_key=object_key,
            file_name=file_name,
            file_size_bytes=file_size_bytes,
            mime_type=mime_type,
            checksum_sha256=checksum_sha256,
            scan_status=ScanStatus.PENDING_SCAN,
            created_at=now,
        )
        await self.reporting_repo.create_media(media)

        return {
            "media_id": str(media_id),
            "upload_url": target.url,
            "upload_method": target.method,
            "upload_headers": dict(target.headers),
            "upload_fields": dict(target.fields),
            "object_key": object_key,
            "expires_in_seconds": expires_in,
        }

    async def confirm_upload(
        self,
        media_id: UUID,
        width_px: int | None = None,  # accepted for API compatibility; measured server-side instead
        height_px: int | None = None,
        exif_lat: float | None = None,
        exif_lon: float | None = None,
        uploader_id: UUID | None = None,
    ) -> MediaObject:
        """Client confirms upload completion; triggers scan verification and updates metadata."""
        media = await self.reporting_repo.get_media_by_id(media_id)
        # Only the uploader may confirm their own upload; anyone else gets the same answer as a missing id.
        if not media or (uploader_id is not None and media.uploader_id != uploader_id):
            raise MediaNotFoundError(f"Media record {media_id} not found.")

        # Retry after a lost response: an already decided photo keeps its decision.
        if media.scan_status in {ScanStatus.CLEAN, ScanStatus.REJECTED, ScanStatus.QUARANTINED}:
            return media

        # Read the bytes that were really stored; the client's claims are checked against them.
        try:
            data = await self.storage.get_object(media.bucket, media.object_key)
        except FileNotFoundError as exc:
            raise MediaStorageUnavailableError("The photo has not arrived in storage yet. Try again.") from exc
        except Exception as exc:  # noqa: BLE001 - any storage failure is transient from the client's view
            raise MediaStorageUnavailableError("The photo could not be read back from storage. Try again.") from exc

        findings: dict[str, Any] = {"verified_at": datetime.now(UTC).isoformat()}
        status = ScanStatus.CLEAN
        width_px = height_px = None
        try:
            inspection = self.inspector.inspect(
                data,
                declared_mime=media.mime_type,
                declared_size=media.file_size_bytes,
                declared_sha256=media.checksum_sha256,
            )
            width_px, height_px = inspection.width_px, inspection.height_px
            findings.update({"format": inspection.format, "sha256": inspection.sha256})
        except MediaRejectedError as exc:
            status = ScanStatus.REJECTED
            findings.update({"rejected": True, "reason_code": exc.code, "message": exc.message})

        if status is ScanStatus.CLEAN:
            if self.scanner is None:
                findings["malware_scan"] = "not_configured"
            else:
                try:
                    verdict = await self.scanner.scan(data)
                except Exception as exc:  # noqa: BLE001
                    if getattr(self.settings, "CLAMAV_REQUIRED", False):
                        raise MediaStorageUnavailableError("The virus scanner is unavailable. Try again.") from exc
                    findings["malware_scan"] = "unavailable"
                else:
                    findings["malware_scan"] = "clean" if verdict.clean else "infected"
                    if not verdict.clean:
                        status = ScanStatus.QUARANTINED
                        findings.update({"rejected": True, "reason_code": "MALWARE", "message": "The file was flagged by the virus scanner.", "signature": verdict.signature})

        await self.reporting_repo.update_media_scan(
            media_id=media_id,
            status=status,
            findings=findings,
            width_px=width_px,
            height_px=height_px,
            exif_lat=None,
            exif_lon=None,
        )
        if status is not ScanStatus.CLEAN:
            # Do not keep a rejected file around.
            try:
                await self.storage.delete_object(media.bucket, media.object_key)
            except Exception:  # noqa: BLE001
                pass

        updated = await self.reporting_repo.get_media_by_id(media_id)
        assert updated is not None
        return updated

    async def generate_download_url(
        self,
        media_id: UUID,
        principal: PrincipalContext,
    ) -> str:
        """
        Signed, expiring download link. Allowed for the uploader, or for a principal who holds
        VIEW_REPORT_MEDIA and can see at least one report the photo is attached to.
        """
        media = await self.reporting_repo.get_media_by_id(media_id)
        if not media:
            raise MediaNotFoundError(f"Media record {media_id} not found.")

        if media.uploader_id != principal.user_id:
            if Capability.VIEW_REPORT_MEDIA not in principal.capabilities:
                raise ForbiddenError("Principal lacks VIEW_REPORT_MEDIA capability.")
            scope = scope_for(principal)
            attached = await self.reporting_repo.list_reports_for_media(media_id)
            if not any(can_view_report(scope, r.reporter_id, r.jurisdiction_id) for r in attached):
                raise MediaNotFoundError(f"Media record {media_id} not found.")

        return await self.storage.generate_presigned_download_url(
            bucket=media.bucket,
            object_key=media.object_key,
            expires_in_seconds=900,
        )
