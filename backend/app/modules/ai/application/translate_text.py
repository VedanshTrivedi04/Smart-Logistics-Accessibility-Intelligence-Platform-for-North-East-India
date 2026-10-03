"""
app/modules/ai/application/translate_text.py — machine translation of typed text (Module 4).
"""

from __future__ import annotations

from app.modules.ai.application.ports import SpeechTranslationPort
from app.modules.ai.domain.entities import TextTranslation
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError


class TranslateTextUseCase:
    """Translates typed text; the counterpart of voice transcription for languages without ASR."""

    def __init__(self, translator: SpeechTranslationPort) -> None:
        self.translator = translator

    async def execute(
        self, text: str, source_language: str, target_language: str = "en"
    ) -> TextTranslation:
        if not text or not text.strip():
            raise InvalidFeatureVectorError("text must not be empty")
        if not source_language:
            raise InvalidFeatureVectorError("source_language must not be empty")
        return await self.translator.translate_text(
            text=text, source_language=source_language, target_language=target_language
        )
