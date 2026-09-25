"""
app/core/storage.py — Object Storage Port & Adapters (MinIO / S3 and In-Memory Test Fallback).
"""

from __future__ import annotations

import hashlib
import io
import time
from abc import ABC, abstractmethod
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, BinaryIO
from urllib.parse import urlencode

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class UploadTarget:
    """Where and how a client uploads one file directly to storage."""

    url: str
    method: str = "PUT"
    headers: Mapping[str, str] = field(default_factory=dict)
    # Extra multipart form fields (signed upload parameters). Empty for a plain PUT.
    fields: Mapping[str, str] = field(default_factory=dict)


class ObjectStoragePort(ABC):
    """Abstract Port for Object Storage operations."""

    async def create_upload_target(
        self,
        bucket: str,
        object_key: str,
        content_type: str,
        expires_in_seconds: int = 900,
    ) -> UploadTarget:
        """Describe a direct client upload. Default: a presigned PUT; adapters may override."""
        url = await self.generate_presigned_upload_url(bucket, object_key, content_type, expires_in_seconds)
        return UploadTarget(url=url, method="PUT", headers={"Content-Type": content_type})

    @abstractmethod
    async def generate_presigned_upload_url(
        self,
        bucket: str,
        object_key: str,
        content_type: str,
        expires_in_seconds: int = 900,
    ) -> str:
        """Generate a time-bounded presigned URL for direct client PUT upload."""
        ...

    @abstractmethod
    async def generate_presigned_download_url(
        self,
        bucket: str,
        object_key: str,
        expires_in_seconds: int = 900,
    ) -> str:
        """Generate a time-bounded presigned URL for authorized client GET download."""
        ...

    @abstractmethod
    async def put_object(
        self,
        bucket: str,
        object_key: str,
        data: bytes | BinaryIO,
        content_type: str,
    ) -> None:
        """Store an object directly."""
        ...

    @abstractmethod
    async def get_object(self, bucket: str, object_key: str) -> bytes:
        """Fetch an object binary."""
        ...

    @abstractmethod
    async def delete_object(self, bucket: str, object_key: str) -> None:
        """Delete an object from bucket."""
        ...


class S3StorageService(ObjectStoragePort):
    """Production S3 / MinIO adapter using boto3 client."""

    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        settings = get_settings()
        self.endpoint = settings.OBJECT_STORAGE_ENDPOINT
        self.client = boto3.client(
            "s3",
            endpoint_url=self.endpoint,
            aws_access_key_id=settings.OBJECT_STORAGE_ACCESS_KEY,
            aws_secret_access_key=settings.OBJECT_STORAGE_SECRET_KEY,
            region_name=settings.OBJECT_STORAGE_REGION,
            config=Config(signature_version="s3v4"),
        )

    async def generate_presigned_upload_url(
        self,
        bucket: str,
        object_key: str,
        content_type: str,
        expires_in_seconds: int = 900,
    ) -> str:
        try:
            return self.client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": bucket,
                    "Key": object_key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in_seconds,
            )
        except Exception as exc:
            logger.warning("failed_to_generate_presigned_upload_url", error=str(exc))
            # Fallback for local dev/testing if endpoint unreachable
            return f"{self.endpoint}/{bucket}/{object_key}?presigned=upload"

    async def generate_presigned_download_url(
        self,
        bucket: str,
        object_key: str,
        expires_in_seconds: int = 900,
    ) -> str:
        try:
            return self.client.generate_presigned_url(
                ClientMethod="get_object",
                Params={
                    "Bucket": bucket,
                    "Key": object_key,
                },
                ExpiresIn=expires_in_seconds,
            )
        except Exception as exc:
            logger.warning("failed_to_generate_presigned_download_url", error=str(exc))
            return f"{self.endpoint}/{bucket}/{object_key}?presigned=download"

    async def put_object(
        self,
        bucket: str,
        object_key: str,
        data: bytes | BinaryIO,
        content_type: str,
    ) -> None:
        body = data if isinstance(data, (bytes, bytearray)) else data.read()
        self.client.put_object(
            Bucket=bucket,
            Key=object_key,
            Body=body,
            ContentType=content_type,
        )

    async def get_object(self, bucket: str, object_key: str) -> bytes:
        resp = self.client.get_object(Bucket=bucket, Key=object_key)
        return resp["Body"].read()

    async def delete_object(self, bucket: str, object_key: str) -> None:
        self.client.delete_object(Bucket=bucket, Key=object_key)


class CloudinaryError(RuntimeError):
    """Cloudinary rejected a request or could not be reached."""


class CloudinaryStorageService(ObjectStoragePort):
    """
    Cloudinary adapter. Every asset is stored with delivery type "authenticated", so a file is only
    reachable through a link signed with the API secret; there is no public URL.

    Uploads go straight from the client with signed parameters (multipart POST). Downloads use the
    signed, expiring private-download endpoint. The secret never leaves the server.
    """

    API_BASE = "https://api.cloudinary.com/v1_1"
    ALLOWED_FORMATS = "jpg,png,webp"
    # Parameters that are sent with a request but are not part of the signature.
    _UNSIGNED = frozenset({"file", "cloud_name", "resource_type", "api_key", "signature"})

    def __init__(
        self,
        *,
        cloud_name: str,
        api_key: str,
        api_secret: str,
        folder: str = "ner",
        transport: Any = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        if not (cloud_name and api_key and api_secret):
            raise CloudinaryError("Cloudinary needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.")
        self.cloud_name = cloud_name
        self.api_key = api_key
        self._api_secret = api_secret
        self.folder = folder.strip("/")
        self._transport = transport
        self._clock = clock

    # ---- signing -------------------------------------------------------
    @classmethod
    def sign(cls, params: Mapping[str, Any], api_secret: str) -> str:
        """Cloudinary API signature: sha1 of the sorted `k=v` pairs joined by `&`, followed by the secret."""
        parts = []
        for key in sorted(params):
            value = params[key]
            if key in cls._UNSIGNED or value is None or value == "":
                continue
            if isinstance(value, (list, tuple)):
                value = ",".join(str(v) for v in value)
            parts.append(f"{key}={value}")
        return hashlib.sha1(("&".join(parts) + api_secret).encode("utf-8")).hexdigest()  # noqa: S324 - required by Cloudinary

    def _signed(self, params: dict[str, Any]) -> dict[str, str]:
        signed = {k: str(v) for k, v in params.items() if v is not None and v != ""}
        signed["api_key"] = self.api_key
        signed["signature"] = self.sign(params, self._api_secret)
        return signed

    def _now(self) -> int:
        return int(self._clock())

    # ---- addressing ----------------------------------------------------
    def _split(self, bucket: str, object_key: str) -> tuple[str, str]:
        stem, _, ext = object_key.rpartition(".")
        if not stem:
            stem, ext = object_key, ""
        return f"{self.folder}/{bucket}/{stem}", ext

    def _url(self, action: str) -> str:
        return f"{self.API_BASE}/{self.cloud_name}/image/{action}"

    def _client(self) -> Any:
        import httpx

        return httpx.AsyncClient(transport=self._transport, timeout=30.0, follow_redirects=True)

    # ---- port ----------------------------------------------------------
    async def create_upload_target(
        self,
        bucket: str,
        object_key: str,
        content_type: str,
        expires_in_seconds: int = 900,
    ) -> UploadTarget:
        public_id, _ = self._split(bucket, object_key)
        params = {
            "allowed_formats": self.ALLOWED_FORMATS,
            "public_id": public_id,
            "timestamp": self._now(),
            "type": "authenticated",
        }
        # Cloudinary accepts a signed upload for about an hour; expires_in_seconds is not enforced here.
        return UploadTarget(url=self._url("upload"), method="POST", fields=self._signed(params))

    async def generate_presigned_upload_url(
        self,
        bucket: str,
        object_key: str,
        content_type: str,
        expires_in_seconds: int = 900,
    ) -> str:
        return (await self.create_upload_target(bucket, object_key, content_type, expires_in_seconds)).url

    async def generate_presigned_download_url(
        self,
        bucket: str,
        object_key: str,
        expires_in_seconds: int = 900,
    ) -> str:
        public_id, ext = self._split(bucket, object_key)
        now = self._now()
        params = {
            "expires_at": now + expires_in_seconds,
            "format": ext,
            "public_id": public_id,
            "timestamp": now,
            "type": "authenticated",
        }
        return f"{self._url('download')}?{urlencode(self._signed(params))}"

    async def put_object(
        self,
        bucket: str,
        object_key: str,
        data: bytes | BinaryIO,
        content_type: str,
    ) -> None:
        body = data if isinstance(data, (bytes, bytearray)) else data.read()
        target = await self.create_upload_target(bucket, object_key, content_type)
        async with self._client() as client:
            resp = await client.post(
                target.url,
                data=dict(target.fields),
                files={"file": (object_key.rsplit("/", 1)[-1], bytes(body), content_type)},
            )
        self._raise_for(resp, "upload")

    async def get_object(self, bucket: str, object_key: str) -> bytes:
        url = await self.generate_presigned_download_url(bucket, object_key, expires_in_seconds=300)
        async with self._client() as client:
            resp = await client.get(url)
        if resp.status_code == 404:
            raise FileNotFoundError(f"Object not found in Cloudinary: {bucket}/{object_key}")
        self._raise_for(resp, "download")
        return resp.content

    async def delete_object(self, bucket: str, object_key: str) -> None:
        public_id, _ = self._split(bucket, object_key)
        params = {"public_id": public_id, "timestamp": self._now(), "type": "authenticated"}
        async with self._client() as client:
            resp = await client.post(self._url("destroy"), data=self._signed(params))
        self._raise_for(resp, "delete")

    @staticmethod
    def _raise_for(resp: Any, action: str) -> None:
        if resp.status_code >= 400:
            # Never include request parameters: they carry the API key and signature.
            raise CloudinaryError(f"Cloudinary {action} failed with HTTP {resp.status_code}")


class MockStorageService(ObjectStoragePort):
    """In-memory object storage for fast unit and integration testing without live MinIO."""

    def __init__(self) -> None:
        self._store: dict[str, bytes] = {}

    async def generate_presigned_upload_url(
        self,
        bucket: str,
        object_key: str,
        content_type: str,
        expires_in_seconds: int = 900,
    ) -> str:
        return f"http://mock-storage/{bucket}/{object_key}?signature=upload-token&expires={expires_in_seconds}"

    async def generate_presigned_download_url(
        self,
        bucket: str,
        object_key: str,
        expires_in_seconds: int = 900,
    ) -> str:
        return f"http://mock-storage/{bucket}/{object_key}?signature=download-token&expires={expires_in_seconds}"

    async def put_object(
        self,
        bucket: str,
        object_key: str,
        data: bytes | BinaryIO,
        content_type: str,
    ) -> None:
        body = data if isinstance(data, (bytes, bytearray)) else data.read()
        self._store[f"{bucket}/{object_key}"] = body

    async def get_object(self, bucket: str, object_key: str) -> bytes:
        key = f"{bucket}/{object_key}"
        if key not in self._store:
            raise FileNotFoundError(f"Object not found in mock storage: {key}")
        return self._store[key]

    async def delete_object(self, bucket: str, object_key: str) -> None:
        self._store.pop(f"{bucket}/{object_key}", None)


_storage_service: ObjectStoragePort | None = None


def get_storage_service() -> ObjectStoragePort:
    """Return the configured storage service instance."""
    global _storage_service
    if _storage_service is None:
        settings = get_settings()
        # In test environments or when explicitly requested, use MockStorageService
        import os
        if os.environ.get("USE_MOCK_STORAGE") == "true" or os.environ.get("PYTEST_CURRENT_TEST"):
            _storage_service = MockStorageService()
        elif settings.STORAGE_BACKEND == "cloudinary":
            # No silent fallback: a misconfigured Cloudinary must fail loudly, not drop evidence photos.
            _storage_service = CloudinaryStorageService(
                cloud_name=settings.CLOUDINARY_CLOUD_NAME,
                api_key=settings.CLOUDINARY_API_KEY,
                api_secret=settings.CLOUDINARY_API_SECRET,
                folder=settings.CLOUDINARY_FOLDER,
            )
        else:
            try:
                _storage_service = S3StorageService()
            except Exception as e:
                logger.warning("s3_init_failed_falling_back_to_mock", error=str(e))
                _storage_service = MockStorageService()
    return _storage_service
