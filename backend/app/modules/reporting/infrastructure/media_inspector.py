"""
app/modules/reporting/infrastructure/media_inspector.py — Opens uploaded photos for real.

The client declares a MIME type, size and checksum, but those are claims. This reads the stored
bytes: checks size and SHA-256, the file signature, and that the image actually decodes with the
declared format and sane dimensions. It is content validation, not antivirus (see the optional
ClamAV adapter for that).
"""

from __future__ import annotations

import hashlib
import io

from PIL import Image, UnidentifiedImageError

from app.modules.reporting.application.ports import MediaInspection, MediaInspectorPort, MediaRejectedError

MAX_BYTES = 10 * 1024 * 1024
MAX_EDGE_PX = 4096

_MIME_TO_FORMAT = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


def _signature_matches(fmt: str, head: bytes) -> bool:
    if fmt == "JPEG":
        return head.startswith(b"\xff\xd8\xff")
    if fmt == "PNG":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if fmt == "WEBP":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    return False


class PillowMediaInspector(MediaInspectorPort):
    def inspect(self, data: bytes, *, declared_mime: str, declared_size: int, declared_sha256: str) -> MediaInspection:
        expected_format = _MIME_TO_FORMAT.get(declared_mime)
        if expected_format is None:
            raise MediaRejectedError("UNSUPPORTED_TYPE", f"{declared_mime} photos are not accepted.")
        if len(data) == 0 or len(data) > MAX_BYTES:
            raise MediaRejectedError("BAD_SIZE", "The photo is empty or larger than 10 MB.")
        if len(data) != declared_size:
            raise MediaRejectedError("SIZE_MISMATCH", "The uploaded file is not the size that was declared.")

        digest = hashlib.sha256(data).hexdigest()
        if digest.lower() != declared_sha256.lower():
            raise MediaRejectedError("CHECKSUM_MISMATCH", "The uploaded file does not match its checksum; it may be corrupted.")

        if not _signature_matches(expected_format, data[:16]):
            raise MediaRejectedError("SIGNATURE_MISMATCH", f"The file is not really a {expected_format} image.")

        try:
            with Image.open(io.BytesIO(data)) as img:
                if img.format != expected_format:
                    raise MediaRejectedError("FORMAT_MISMATCH", f"The file is {img.format}, not {expected_format}.")
                width, height = img.size
                # Check the header dimensions before decoding, so a small file cannot expand into a huge bitmap.
                if width < 1 or height < 1 or width > MAX_EDGE_PX or height > MAX_EDGE_PX:
                    raise MediaRejectedError("BAD_DIMENSIONS", f"The photo is {width}x{height}px; the limit is {MAX_EDGE_PX}px per side.")
                img.load()  # full decode: raises on truncated or corrupt data
        except MediaRejectedError:
            raise
        except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
            raise MediaRejectedError("NOT_AN_IMAGE", "The file could not be read as an image.") from exc

        return MediaInspection(width_px=width, height_px=height, sha256=digest, format=expected_format)
