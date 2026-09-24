"""
tests/unit/ai/test_transcribe_voice_report.py — Unit Tests for TranscribeVoiceReportUseCase.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.modules.ai.application.ports import SpeechTranslationPort
from app.modules.ai.application.transcribe_voice_report import TranscribeVoiceReportUseCase
from app.modules.ai.domain.entities import VoiceTranscript
from app.modules.ai.domain.enums import ModelStatus
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError


class TestTranscribeVoiceReportUseCase:
    async def test_delegates_to_port(self) -> None:
        expected = VoiceTranscript(
            source_language="as",
            target_language="en",
            transcribed_text="landslide near NH-6",
            translated_text="Landslide near NH-6",
            model_status=ModelStatus.LOADED,
        )
        port = AsyncMock(spec=SpeechTranslationPort)
        port.transcribe_and_translate.return_value = expected

        use_case = TranscribeVoiceReportUseCase(port)
        result = await use_case.execute(audio_bytes=b"audio", source_language="as")

        assert result is expected
        port.transcribe_and_translate.assert_awaited_once_with(
            audio_bytes=b"audio", source_language="as", target_language="en"
        )

    async def test_empty_audio_rejected(self) -> None:
        port = AsyncMock(spec=SpeechTranslationPort)
        use_case = TranscribeVoiceReportUseCase(port)

        with pytest.raises(InvalidFeatureVectorError):
            await use_case.execute(audio_bytes=b"", source_language="as")

        port.transcribe_and_translate.assert_not_awaited()

    async def test_empty_source_language_rejected(self) -> None:
        port = AsyncMock(spec=SpeechTranslationPort)
        use_case = TranscribeVoiceReportUseCase(port)

        with pytest.raises(InvalidFeatureVectorError):
            await use_case.execute(audio_bytes=b"audio", source_language="")

        port.transcribe_and_translate.assert_not_awaited()
