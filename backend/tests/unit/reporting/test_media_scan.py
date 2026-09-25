"""
tests/unit/reporting/test_media_scan.py — confirm_upload reads the stored bytes and validates them.

Uses real image bytes made with Pillow; nothing here trusts what the client declared.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import struct
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from PIL import Image

from app.core.storage import MockStorageService
from app.modules.reporting.application.media_service import MediaUploadService
from app.modules.reporting.application.ports import MalwareScannerPort, ScanVerdict
from app.modules.reporting.domain.entities import MediaObject
from app.modules.reporting.domain.enums import ScanStatus
from app.modules.reporting.domain.exceptions import MediaStorageUnavailableError
from app.modules.reporting.infrastructure.clamav_scanner import ClamAvScanner
from app.modules.reporting.infrastructure.media_inspector import PillowMediaInspector

UPLOADER = uuid.uuid4()


def make_image(fmt: str = "JPEG", size: tuple[int, int] = (64, 48)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (120, 80, 40)).save(buf, format=fmt)
    return buf.getvalue()


MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


class Repo:
    def __init__(self, media: MediaObject) -> None:
        self.media = media
        self.updates: list[dict[str, Any]] = []

    async def get_media_by_id(self, _id: uuid.UUID) -> MediaObject:
        return self.media

    async def update_media_scan(self, media_id: uuid.UUID, status: ScanStatus, findings: dict[str, Any] | None = None, width_px: int | None = None, height_px: int | None = None, **_: Any) -> None:
        self.updates.append({"status": status, "findings": findings, "w": width_px, "h": height_px})
        self.media = MediaObject(**{**self.media.__dict__, "scan_status": status, "scan_findings": findings, "width_px": width_px, "height_px": height_px})


def media_for(data: bytes, *, mime: str = "image/jpeg", size: int | None = None, sha: str | None = None) -> MediaObject:
    return MediaObject(
        id=uuid.uuid4(),
        uploader_id=UPLOADER,
        bucket="b",
        object_key="quarantine/2026/09/x.jpg",
        file_name="x.jpg",
        file_size_bytes=len(data) if size is None else size,
        mime_type=mime,
        checksum_sha256=hashlib.sha256(data).hexdigest() if sha is None else sha,
        scan_status=ScanStatus.PENDING_SCAN,
        created_at=datetime.now(UTC),
    )


async def confirm(data: bytes | None, media: MediaObject, *, scanner: MalwareScannerPort | None = None, settings: Any = None) -> tuple[MediaObject, Repo, MockStorageService]:
    storage = MockStorageService()
    if data is not None:
        await storage.put_object(media.bucket, media.object_key, data, media.mime_type)
    repo = Repo(media)
    svc = MediaUploadService(repo, storage, PillowMediaInspector(), scanner)  # type: ignore[arg-type]
    if settings is not None:
        svc.settings = settings
    result = await svc.confirm_upload(media.id, uploader_id=UPLOADER)
    return result, repo, storage


class TestValidPhotos:
    @pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
    async def test_real_images_are_marked_clean_with_measured_dimensions(self, fmt: str) -> None:
        data = make_image(fmt, (64, 48))
        result, repo, _ = await confirm(data, media_for(data, mime=MIME[fmt]))
        assert result.scan_status is ScanStatus.CLEAN
        assert (repo.updates[0]["w"], repo.updates[0]["h"]) == (64, 48)
        assert repo.updates[0]["findings"]["malware_scan"] == "not_configured"

    async def test_a_decided_photo_is_not_rescanned_on_retry(self) -> None:
        data = make_image()
        media = media_for(data)
        result, repo, storage = await confirm(data, media)
        await storage.delete_object(media.bucket, media.object_key)  # gone, but the decision stands
        svc = MediaUploadService(repo, storage, PillowMediaInspector(), None)  # type: ignore[arg-type]
        again = await svc.confirm_upload(media.id, uploader_id=UPLOADER)
        assert again.scan_status is ScanStatus.CLEAN
        assert len(repo.updates) == 1


class TestRejectedPhotos:
    async def _rejected(self, data: bytes, media: MediaObject) -> tuple[str, MediaObject, MockStorageService]:
        result, repo, storage = await confirm(data, media)
        assert result.scan_status is ScanStatus.REJECTED
        return repo.updates[0]["findings"]["reason_code"], result, storage

    async def test_checksum_mismatch(self) -> None:
        data = make_image()
        code, _, _ = await self._rejected(data, media_for(data, sha="0" * 64))
        assert code == "CHECKSUM_MISMATCH"

    async def test_size_mismatch(self) -> None:
        data = make_image()
        code, _, _ = await self._rejected(data, media_for(data, size=len(data) + 5))
        assert code == "SIZE_MISMATCH"

    async def test_png_declared_as_jpeg(self) -> None:
        data = make_image("PNG")
        code, _, _ = await self._rejected(data, media_for(data, mime="image/jpeg"))
        assert code == "SIGNATURE_MISMATCH"

    async def test_text_file_renamed_to_jpg(self) -> None:
        data = b"<script>alert(1)</script>" * 20
        code, _, _ = await self._rejected(data, media_for(data))
        assert code == "SIGNATURE_MISMATCH"

    async def test_truncated_image_fails_to_decode(self) -> None:
        full = make_image("JPEG", (400, 300))
        data = full[: len(full) // 2]
        code, _, _ = await self._rejected(data, media_for(data))
        assert code == "NOT_AN_IMAGE"

    async def test_oversized_dimensions(self) -> None:
        data = make_image("PNG", (4200, 8))
        code, _, _ = await self._rejected(data, media_for(data, mime="image/png"))
        assert code == "BAD_DIMENSIONS"

    async def test_rejected_file_is_deleted_from_storage(self) -> None:
        data = make_image()
        _, result, storage = await self._rejected(data, media_for(data, sha="f" * 64))
        with pytest.raises(FileNotFoundError):
            await storage.get_object(result.bucket, result.object_key)


class TestStorageProblems:
    async def test_file_missing_from_storage_is_retryable(self) -> None:
        data = make_image()
        with pytest.raises(MediaStorageUnavailableError) as exc:
            await confirm(None, media_for(data))
        assert exc.value.http_status == 503

    async def test_nothing_is_marked_clean_when_the_file_is_missing(self) -> None:
        data = make_image()
        media = media_for(data)
        repo = Repo(media)
        svc = MediaUploadService(repo, MockStorageService(), PillowMediaInspector(), None)  # type: ignore[arg-type]
        with pytest.raises(MediaStorageUnavailableError):
            await svc.confirm_upload(media.id, uploader_id=UPLOADER)
        assert repo.updates == []


class FakeScanner(MalwareScannerPort):
    def __init__(self, verdict: ScanVerdict | Exception) -> None:
        self.verdict = verdict

    async def scan(self, data: bytes) -> ScanVerdict:
        if isinstance(self.verdict, Exception):
            raise self.verdict
        return self.verdict


class TestMalwareScanner:
    async def test_infected_file_is_quarantined(self) -> None:
        data = make_image()
        result, repo, _ = await confirm(data, media_for(data), scanner=FakeScanner(ScanVerdict(clean=False, signature="Eicar-Test-Signature")))
        assert result.scan_status is ScanStatus.QUARANTINED
        assert repo.updates[0]["findings"]["signature"] == "Eicar-Test-Signature"

    async def test_clean_verdict_is_recorded(self) -> None:
        data = make_image()
        result, repo, _ = await confirm(data, media_for(data), scanner=FakeScanner(ScanVerdict(clean=True)))
        assert result.scan_status is ScanStatus.CLEAN
        assert repo.updates[0]["findings"]["malware_scan"] == "clean"

    async def test_unreachable_scanner_is_skipped_unless_required(self) -> None:
        data = make_image()
        result, repo, _ = await confirm(data, media_for(data), scanner=FakeScanner(ConnectionError("down")), settings=SimpleNamespace(CLAMAV_REQUIRED=False))
        assert result.scan_status is ScanStatus.CLEAN
        assert repo.updates[0]["findings"]["malware_scan"] == "unavailable"

    async def test_unreachable_scanner_blocks_when_required(self) -> None:
        data = make_image()
        with pytest.raises(MediaStorageUnavailableError):
            await confirm(data, media_for(data), scanner=FakeScanner(ConnectionError("down")), settings=SimpleNamespace(CLAMAV_REQUIRED=True))


class TestClamAvProtocol:
    """The adapter against a stand-in clamd that speaks the INSTREAM wire protocol."""

    async def _serve(self, reply: bytes) -> tuple[asyncio.AbstractServer, int, list[bytes]]:
        received: list[bytes] = []

        async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
            assert await reader.readexactly(10) == b"zINSTREAM\0"
            payload = b""
            while True:
                (n,) = struct.unpack("!I", await reader.readexactly(4))
                if n == 0:
                    break
                payload += await reader.readexactly(n)
            received.append(payload)
            writer.write(reply)
            await writer.drain()
            writer.close()

        server = await asyncio.start_server(handle, "127.0.0.1", 0)
        return server, server.sockets[0].getsockname()[1], received

    async def test_clean_reply(self) -> None:
        server, port, received = await self._serve(b"stream: OK\0")
        async with server:
            verdict = await ClamAvScanner("127.0.0.1", port).scan(b"x" * 200_000)
        assert verdict.clean
        assert len(received[0]) == 200_000  # streamed in several chunks and reassembled

    async def test_infected_reply(self) -> None:
        server, port, _ = await self._serve(b"stream: Win.Test.EICAR_HDB-1 FOUND\0")
        async with server:
            verdict = await ClamAvScanner("127.0.0.1", port).scan(b"abc")
        assert not verdict.clean
        assert verdict.signature == "Win.Test.EICAR_HDB-1"
