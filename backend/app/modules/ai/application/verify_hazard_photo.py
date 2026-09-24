"""
app/modules/ai/application/verify_hazard_photo.py — Use case for CV hazard photo verification.
"""

from __future__ import annotations

from app.modules.ai.application.ports import HazardVerifierPort
from app.modules.ai.domain.entities import HazardVerification
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError


class VerifyHazardPhotoUseCase:
    """Classifies a submitted field-report photo for hazard type, severity, and blockage."""

    def __init__(self, hazard_verifier: HazardVerifierPort) -> None:
        self.hazard_verifier = hazard_verifier

    async def execute(self, image_bytes: bytes) -> HazardVerification:
        if not image_bytes:
            raise InvalidFeatureVectorError("image_bytes must not be empty")
        return await self.hazard_verifier.verify(image_bytes)
