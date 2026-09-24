"""
app/modules/ai/application/transcribe_voice_report.py — Use case for voice-note
transcription + translation (Module 4).
"""

from __future__ import annotations

from app.modules.ai.application.ports import SpeechTranslationPort
from app.modules.ai.domain.entities import VoiceTranscript
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError


class TranscribeVoiceReportUseCase:
    """
    Transcribes and translates a field officer's spoken voice note. The
    resulting `translated_text` is meant to populate an existing field
    report's `description` via reporting's already-existing
    SubmitFieldReportUseCase — this use case does not itself create a report
    (see VoiceTranscript's docstring for why structured field extraction is
    out of scope).
    """

    def __init__(self, speech_translator: SpeechTranslationPort) -> None:
        self.speech_translator = speech_translator

    async def execute(
        self,
        audio_bytes: bytes,
        source_language: str,
        target_language: str = "en",
    ) -> VoiceTranscript:
        if not audio_bytes:
            raise InvalidFeatureVectorError("audio_bytes must not be empty")
        if not source_language:
            raise InvalidFeatureVectorError("source_language must not be empty")

        return await self.speech_translator.transcribe_and_translate(
            audio_bytes=audio_bytes,
            source_language=source_language,
            target_language=target_language,
        )
