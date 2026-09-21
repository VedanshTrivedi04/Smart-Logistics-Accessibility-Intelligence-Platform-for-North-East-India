"""
tests/unit/reporting/test_media_validation.py — Unit Tests for Media Object Constraints.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.modules.reporting.domain.entities import MediaObject
from app.modules.reporting.domain.enums import ScanStatus
from app.modules.reporting.domain.exceptions import MediaValidationError


class TestMediaValidation:
    def test_valid_image_passes_validation(self) -> None:
        media = MediaObject(
            id=uuid.uuid4(),
            uploader_id=uuid.uuid4(),
            bucket="ner-evidence",
            object_key="quarantine/2026/09/sample.jpg",
            file_name="sample.jpg",
            file_size_bytes=1024 * 1024,  # 1 MB
            mime_type="image/jpeg",
            checksum_sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            width_px=1920,
            height_px=1080,
        )
        media.validate()

    def test_invalid_mime_type_raises_validation_error(self) -> None:
        media = MediaObject(
            id=uuid.uuid4(),
            uploader_id=uuid.uuid4(),
            bucket="ner-evidence",
            object_key="quarantine/2026/09/malicious.exe",
            file_name="malicious.exe",
            file_size_bytes=50000,
            mime_type="application/x-msdownload",
            checksum_sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        )
        with pytest.raises(MediaValidationError, match="MIME type 'application/x-msdownload' not permitted"):
            media.validate()

    def test_oversized_file_raises_validation_error(self) -> None:
        media = MediaObject(
            id=uuid.uuid4(),
            uploader_id=uuid.uuid4(),
            bucket="ner-evidence",
            object_key="quarantine/2026/09/huge.jpg",
            file_name="huge.jpg",
            file_size_bytes=15 * 1024 * 1024,  # 15 MB (> 10MB limit)
            mime_type="image/jpeg",
            checksum_sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        )
        with pytest.raises(MediaValidationError, match="exceeds maximum allowed"):
            media.validate()

    def test_oversized_dimensions_raises_validation_error(self) -> None:
        media = MediaObject(
            id=uuid.uuid4(),
            uploader_id=uuid.uuid4(),
            bucket="ner-evidence",
            object_key="quarantine/2026/09/panoramic.jpg",
            file_name="panoramic.jpg",
            file_size_bytes=2 * 1024 * 1024,
            mime_type="image/jpeg",
            checksum_sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            width_px=8192,  # > 4096 px clamp
            height_px=2000,
        )
        with pytest.raises(MediaValidationError, match="Image width 8192px exceeds max 4096px"):
            media.validate()
