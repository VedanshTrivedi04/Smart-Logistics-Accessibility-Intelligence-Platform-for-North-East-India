"""
tests/unit/core/test_cloudinary_storage.py — Cloudinary storage adapter: signing, private upload
targets, signed expiring downloads, and the upload-ticket flow that uses them.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.core.config import Settings
from app.core.storage import CloudinaryError, CloudinaryStorageService, MockStorageService, UploadTarget
from app.modules.reporting.application.media_service import MediaUploadService

NOW = 1_800_000_000


def _service(handler: Any = None) -> CloudinaryStorageService:
    return CloudinaryStorageService(
        cloud_name="demo-cloud",
        api_key="key-123",
        api_secret="s3cret",
        folder="ner",
        transport=httpx.MockTransport(handler) if handler else None,
        clock=lambda: NOW,
    )


class TestSigning:
    def test_matches_the_documented_cloudinary_example(self) -> None:
        # Worked example from Cloudinary's "Generating authentication signatures" documentation.
        params = {"eager": "w_400,h_300,c_pad|w_260,h_200,c_crop", "public_id": "sample_image", "timestamp": "1315060510"}
        assert CloudinaryStorageService.sign(params, "abcd") == "bfd09f95f331f558cbd1320e67aa8d488770583e"

    def test_ignores_unsigned_and_empty_parameters(self) -> None:
        base = {"public_id": "a", "timestamp": "1"}
        noisy = {**base, "api_key": "k", "file": "x", "cloud_name": "c", "resource_type": "image", "signature": "old", "empty": ""}
        assert CloudinaryStorageService.sign(noisy, "abcd") == CloudinaryStorageService.sign(base, "abcd")


class TestUploadTarget:
    async def test_is_a_private_signed_post(self) -> None:
        svc = _service()
        target = await svc.create_upload_target("ner-media-quarantine", "quarantine/2026/09/abc.jpg", "image/jpeg")
        assert target.method == "POST"
        assert target.url == "https://api.cloudinary.com/v1_1/demo-cloud/image/upload"
        f = target.fields
        assert f["type"] == "authenticated"
        assert f["public_id"] == "ner/ner-media-quarantine/quarantine/2026/09/abc"
        assert f["allowed_formats"] == "jpg,png,webp"
        assert f["timestamp"] == str(NOW)
        assert f["api_key"] == "key-123"
        signed = {k: v for k, v in f.items() if k not in ("api_key", "signature")}
        assert f["signature"] == CloudinaryStorageService.sign(signed, "s3cret")

    async def test_secret_is_never_in_the_ticket(self) -> None:
        target = await _service().create_upload_target("b", "k/x.png", "image/png")
        assert "s3cret" not in target.url + "".join(target.fields.values())


class TestDownloadUrl:
    async def test_is_signed_and_expires(self) -> None:
        url = await _service().generate_presigned_download_url("ner-media-quarantine", "quarantine/2026/09/abc.jpg", 600)
        parsed = urlparse(url)
        assert parsed.path == "/v1_1/demo-cloud/image/download"
        q = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        assert q["type"] == "authenticated"
        assert q["format"] == "jpg"
        assert q["public_id"] == "ner/ner-media-quarantine/quarantine/2026/09/abc"
        assert q["expires_at"] == str(NOW + 600)
        assert q["signature"] == CloudinaryStorageService.sign({k: v for k, v in q.items() if k != "signature"}, "s3cret")
        assert "s3cret" not in url


class TestServerSideCalls:
    async def test_get_object_returns_the_bytes(self) -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, content=b"\xff\xd8jpeg")

        data = await _service(handler).get_object("b", "k/x.jpg")
        assert data == b"\xff\xd8jpeg"
        assert seen[0].url.path.endswith("/image/download")

    async def test_missing_asset_is_file_not_found(self) -> None:
        with pytest.raises(FileNotFoundError):
            await _service(lambda r: httpx.Response(404)).get_object("b", "k/x.jpg")

    async def test_rejection_does_not_leak_parameters(self) -> None:
        with pytest.raises(CloudinaryError) as exc:
            await _service(lambda r: httpx.Response(401, json={"error": {"message": "Invalid Signature"}})).put_object("b", "k/x.jpg", b"1", "image/jpeg")
        assert "key-123" not in str(exc.value)
        assert "signature" not in str(exc.value).lower()

    async def test_put_object_posts_signed_multipart(self) -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"public_id": "x"})

        await _service(handler).put_object("b", "k/x.jpg", b"bytes", "image/jpeg")
        body = seen[0].read()
        assert seen[0].method == "POST"
        assert b'name="signature"' in body
        assert b'name="file"' in body
        assert b"authenticated" in body

    async def test_delete_object_calls_destroy(self) -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"result": "ok"})

        await _service(handler).delete_object("b", "k/x.jpg")
        assert seen[0].url.path.endswith("/image/destroy")


class TestConfiguration:
    def test_adapter_refuses_missing_credentials(self) -> None:
        with pytest.raises(CloudinaryError):
            CloudinaryStorageService(cloud_name="", api_key="k", api_secret="s")

    def test_settings_require_cloudinary_values_when_selected(self) -> None:
        with pytest.raises(ValueError, match="CLOUDINARY_CLOUD_NAME"):
            Settings(STORAGE_BACKEND="cloudinary", _env_file=None)  # type: ignore[call-arg]


class _Repo:
    def __init__(self) -> None:
        self.media: list[Any] = []

    async def create_media(self, media: Any) -> None:
        self.media.append(media)


class TestUploadTicket:
    async def test_cloudinary_ticket_carries_post_method_and_fields(self) -> None:
        repo = _Repo()
        service = MediaUploadService(repo, _service())  # type: ignore[arg-type]
        principal = SimpleNamespace(user_id=uuid.uuid4())
        ticket = await service.request_upload_ticket(principal, "photo.jpg", 1234, "image/jpeg", "a" * 64)  # type: ignore[arg-type]
        assert ticket["upload_method"] == "POST"
        assert ticket["upload_fields"]["type"] == "authenticated"
        assert ticket["upload_url"].startswith("https://api.cloudinary.com/")
        assert len(repo.media) == 1

    async def test_default_ticket_is_still_a_put(self) -> None:
        service = MediaUploadService(_Repo(), MockStorageService())  # type: ignore[arg-type]
        principal = SimpleNamespace(user_id=uuid.uuid4())
        ticket = await service.request_upload_ticket(principal, "photo.jpg", 1234, "image/jpeg", "b" * 64)  # type: ignore[arg-type]
        assert ticket["upload_method"] == "PUT"
        assert ticket["upload_headers"] == {"Content-Type": "image/jpeg"}
        assert ticket["upload_fields"] == {}

    async def test_default_target_type(self) -> None:
        target = await MockStorageService().create_upload_target("b", "k.jpg", "image/jpeg")
        assert isinstance(target, UploadTarget)
