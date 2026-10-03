"""
tests/unit/ai/test_voice_report.py — voice note -> field report: domain rules + use case.

Safety properties under test: severity is never inferred; HIGH/CRITICAL needs an explicit type;
empty/stub transcripts create nothing; replays skip ASR; invalid input fails before ASR.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.modules.ai.application.ports import SpeechTranslationPort
from app.modules.ai.application.submit_voice_report import SubmitVoiceReportUseCase
from app.modules.ai.domain.entities import VoiceTranscript
from app.modules.ai.domain.enums import ModelStatus
from app.modules.ai.domain.exceptions import (
    EmptyTranscriptError,
    ModelNotLoadedError,
    VoiceReportInputError,
)
from app.modules.ai.domain.voice_report import (
    MAX_DESCRIPTION_CHARS,
    build_voice_report_description,
    require_explicit_type_for_severity,
    suggest_report_type,
)
from app.modules.reporting.public import (
    LocationPoint,
    ReportingModulePort,
    ReportSeverity,
    ReportType,
)

HI_LANDSLIDE = "सड़क पर भूस्खलन हो गया है"


def _transcript(
    orig: str = HI_LANDSLIDE,
    tr: str = "There is a landslide on the road",
    status: ModelStatus = ModelStatus.LOADED,
) -> VoiceTranscript:
    return VoiceTranscript("hi", "en", orig, tr, status)


class TestSuggestReportType:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("There is a landslide on the road", "LANDSLIDE"),
            (HI_LANDSLIDE, "LANDSLIDE"),
            ("The bridge has collapsed near the village", "BRIDGE_COLLAPSE"),
            ("Heavy flooding, waterlogging on NH-6", "FLOODING"),
            ("A tree fell across the road", "TREE_FALL"),
            ("Large pothole and road damage", "ROAD_DAMAGE"),
            ("cloudburst reported upstream", "WEATHER_HAZARD"),
        ],
    )
    def test_keywords(self, text: str, expected: str) -> None:
        assert suggest_report_type(text) == expected

    def test_no_match_returns_none(self) -> None:
        assert suggest_report_type("Please send a vehicle to the depot") is None

    def test_landslide_near_bridge_is_landslide(self) -> None:
        assert suggest_report_type("landslide near the bridge") == "LANDSLIDE"


class TestSeverityGuard:
    @pytest.mark.parametrize("severity", ["HIGH", "CRITICAL"])
    def test_high_severity_needs_explicit_type(self, severity: str) -> None:
        with pytest.raises(VoiceReportInputError):
            require_explicit_type_for_severity(severity, None)

    def test_high_severity_with_explicit_type_ok(self) -> None:
        require_explicit_type_for_severity("HIGH", "LANDSLIDE")

    @pytest.mark.parametrize("severity", [None, "LOW", "MEDIUM"])
    def test_lower_or_missing_severity_ok_without_type(self, severity: str | None) -> None:
        require_explicit_type_for_severity(severity, None)


class TestDescription:
    def test_has_provenance_tag_and_both_texts(self) -> None:
        d = build_voice_report_description(_transcript())
        assert d.startswith("[Voice report - auto-transcribed, unverified]")
        assert "There is a landslide on the road" in d
        assert f"Original (hi): {HI_LANDSLIDE}" in d

    def test_same_language_does_not_duplicate_text(self) -> None:
        d = build_voice_report_description(_transcript(orig="road blocked", tr="road blocked"))
        assert d.count("road blocked") == 1
        assert "Original" not in d

    def test_truncated_to_reporting_limit(self) -> None:
        d = build_voice_report_description(_transcript(tr="x" * 5000))
        assert len(d) <= MAX_DESCRIPTION_CHARS


def _use_case(
    transcript: VoiceTranscript | None = None,
) -> tuple[SubmitVoiceReportUseCase, Any, Any, Any]:
    translator = AsyncMock(spec=SpeechTranslationPort)
    translator.transcribe_and_translate.return_value = transcript or _transcript()
    reporting = AsyncMock(spec=ReportingModulePort)
    reporting.find_report_by_operation_id.return_value = None
    reporting.submit_report.side_effect = lambda **kw: MagicMock(**kw)
    principal = MagicMock(user_id=uuid.uuid4())
    return SubmitVoiceReportUseCase(translator, reporting), translator, reporting, principal


LOC = LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=25.0)


class TestSubmitVoiceReport:
    async def test_infers_type_defaults_severity_and_flags_both(self) -> None:
        uc, _, reporting, principal = _use_case()
        result = await uc.execute(principal, b"audio", "hi", LOC)
        kwargs = reporting.submit_report.await_args.kwargs
        assert kwargs["report_type"] is ReportType.LANDSLIDE
        assert kwargs["severity"] is ReportSeverity.MEDIUM  # never inferred from speech
        assert result.report_type_inferred and result.severity_defaulted
        assert kwargs["description"].startswith("[Voice report")

    async def test_explicit_fields_are_respected_and_not_flagged(self) -> None:
        uc, _, reporting, principal = _use_case()
        result = await uc.execute(
            principal, b"a", "hi", LOC, ReportType.FLOODING, ReportSeverity.HIGH
        )
        kwargs = reporting.submit_report.await_args.kwargs
        assert kwargs["report_type"] is ReportType.FLOODING
        assert kwargs["severity"] is ReportSeverity.HIGH
        assert not result.report_type_inferred and not result.severity_defaulted

    async def test_unmatched_text_falls_back_to_other(self) -> None:
        uc, _, reporting, principal = _use_case(_transcript(tr="please send help", orig="madad"))
        await uc.execute(principal, b"a", "hi", LOC)
        assert reporting.submit_report.await_args.kwargs["report_type"] is ReportType.OTHER

    async def test_high_severity_without_type_rejected_before_asr(self) -> None:
        uc, translator, reporting, principal = _use_case()
        with pytest.raises(VoiceReportInputError):
            await uc.execute(principal, b"a", "hi", LOC, None, ReportSeverity.CRITICAL)
        translator.transcribe_and_translate.assert_not_awaited()
        reporting.submit_report.assert_not_awaited()

    async def test_invalid_location_rejected_before_asr(self) -> None:
        uc, translator, _, principal = _use_case()
        bad = LocationPoint(longitude=10.0, latitude=26.0, accuracy_m=10.0)  # outside NER
        with pytest.raises(VoiceReportInputError):
            await uc.execute(principal, b"a", "hi", bad)
        translator.transcribe_and_translate.assert_not_awaited()

    async def test_empty_transcript_creates_no_report(self) -> None:
        uc, _, reporting, principal = _use_case(_transcript(orig="  ", tr=""))
        with pytest.raises(EmptyTranscriptError):
            await uc.execute(principal, b"a", "hi", LOC)
        reporting.submit_report.assert_not_awaited()

    async def test_stub_translator_creates_no_report(self) -> None:
        uc, _, reporting, principal = _use_case(
            _transcript(orig="", tr="", status=ModelStatus.STUB)
        )
        with pytest.raises(ModelNotLoadedError):
            await uc.execute(principal, b"a", "hi", LOC)
        reporting.submit_report.assert_not_awaited()

    async def test_replay_returns_existing_without_asr(self) -> None:
        uc, translator, reporting, principal = _use_case()
        existing = MagicMock()
        reporting.find_report_by_operation_id.return_value = existing
        result = await uc.execute(principal, b"a", "hi", LOC, client_operation_id="op-1")
        assert result.replayed and result.report is existing and result.transcript is None
        translator.transcribe_and_translate.assert_not_awaited()
        reporting.submit_report.assert_not_awaited()

    async def test_observed_at_defaults_to_now(self) -> None:
        uc, _, reporting, principal = _use_case()
        before = datetime.now(UTC)
        await uc.execute(principal, b"a", "hi", LOC)
        assert reporting.submit_report.await_args.kwargs["observed_at"] >= before
