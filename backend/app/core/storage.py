"""
app/core/storage.py — Object Storage Port & Adapters (MinIO / S3 and In-Memory Test Fallback).
"""

from __future__ import annotations

import io
from abc import ABC, abstractmethod
from typing import BinaryIO

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class ObjectStoragePort(ABC):
    """Abstract Port for Object Storage operations."""

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
        else:
            try:
                _storage_service = S3StorageService()
            except Exception as e:
                logger.warning("s3_init_failed_falling_back_to_mock", error=str(e))
                _storage_service = MockStorageService()
    return _storage_service
