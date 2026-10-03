"""
app/modules/ai/application/submit_voice_report.py — voice note / typed text -> field report.

Two entry points share one set of conservative rules (see domain/voice_report.py):
  * SubmitVoiceReportUseCase: Bhashini ASR + translation (Hindi, Bengali, English).
  * SubmitTextReportUseCase: typed text + Bhashini translation - for languages without ASR
    (Assamese, Manipuri, Bodo, Nepali).

Flow: input validation and idempotency check (before any provider call) -> provider call ->
conservative field decisions -> Reporting's normal submit path via its public facade, so location
validation, edge/bridge snapping and Policy 21 still apply. The report always enters the human
review workflow; the audio itself is not stored.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.modules.ai.application.ports import SpeechTranslationPort
from app.modules.ai.domain.entities import VoiceTranscript
from app.modules.ai.domain.enums import ModelStatus
from app.modules.ai.domain.exceptions import (
    EmptyTranscriptError,
    ModelNotLoadedError,
    VoiceReportInputError,
)
from app.modules.ai.domain.voice_report import (
    DEFAULT_SEVERITY,
    FALLBACK_REPORT_TYPE,
    TEXT_REPORT_PREFIX,
    VOICE_REPORT_PREFIX,
    build_voice_report_description,
    require_explicit_type_for_severity,
    suggest_report_type,
)
from app.modules.identity.public import PrincipalContext
from app.modules.reporting.public import (
    FieldReport,
    LocationPoint,
    ReportingModulePort,
    ReportSeverity,
    ReportType,
)


@dataclass(frozen=True)
class VoiceReportResult:
    report: FieldReport
    transcript: VoiceTranscript | None  # None when an earlier identical operation was replayed
    report_type_inferred: bool
    severity_defaulted: bool
    replayed: bool = False


def _precheck(
    location: LocationPoint, severity: ReportSeverity | None, report_type: ReportType | None
) -> None:
    """Fail on invalid input before spending a provider call."""
    try:
        location.validate()
    except ValueError as exc:
        raise VoiceReportInputError(str(exc)) from exc
    require_explicit_type_for_severity(
        severity.value if severity else None, report_type.value if report_type else None
    )


async def _replay(
    reporting: ReportingModulePort, principal: PrincipalContext, client_operation_id: str | None
) -> VoiceReportResult | None:
    """An already-submitted client operation is returned as-is, without a second provider call."""
    if not client_operation_id:
        return None
    existing = await reporting.find_report_by_operation_id(principal.user_id, client_operation_id)
    if existing is None:
        return None
    return VoiceReportResult(existing, None, False, False, replayed=True)


async def _submit_from_transcript(
    reporting: ReportingModulePort,
    principal: PrincipalContext,
    transcript: VoiceTranscript,
    prefix: str,
    location: LocationPoint,
    report_type: ReportType | None,
    severity: ReportSeverity | None,
    observed_at: datetime | None,
    client_operation_id: str | None,
) -> VoiceReportResult:
    if transcript.model_status is ModelStatus.STUB:
        raise ModelNotLoadedError("Speech/translation provider is not configured on this server")
    if not (transcript.transcribed_text.strip() or transcript.translated_text.strip()):
        raise EmptyTranscriptError("No usable text was produced; nothing was saved")

    inferred = report_type is None
    if report_type is None:
        suggestion = suggest_report_type(transcript.translated_text, transcript.transcribed_text)
        report_type = ReportType(suggestion or FALLBACK_REPORT_TYPE)
    defaulted = severity is None
    chosen_severity = severity or ReportSeverity(DEFAULT_SEVERITY)

    report = await reporting.submit_report(
        principal=principal,
        report_type=report_type,
        severity=chosen_severity,
        description=build_voice_report_description(transcript, prefix=prefix),
        location=location,
        observed_at=observed_at or datetime.now(UTC),
        client_operation_id=client_operation_id,
    )
    return VoiceReportResult(report, transcript, inferred, defaulted)


class SubmitVoiceReportUseCase:
    def __init__(
        self, speech_translator: SpeechTranslationPort, reporting: ReportingModulePort
    ) -> None:
        self.speech_translator = speech_translator
        self.reporting = reporting

    async def execute(
        self,
        principal: PrincipalContext,
        audio_bytes: bytes,
        source_language: str,
        location: LocationPoint,
        report_type: ReportType | None = None,
        severity: ReportSeverity | None = None,
        observed_at: datetime | None = None,
        client_operation_id: str | None = None,
        target_language: str = "en",
    ) -> VoiceReportResult:
        _precheck(location, severity, report_type)
        replay = await _replay(self.reporting, principal, client_operation_id)
        if replay is not None:
            return replay

        transcript = await self.speech_translator.transcribe_and_translate(
            audio_bytes=audio_bytes,
            source_language=source_language,
            target_language=target_language,
        )
        return await _submit_from_transcript(
            self.reporting, principal, transcript, VOICE_REPORT_PREFIX, location,
            report_type, severity, observed_at, client_operation_id,
        )  # fmt: skip


class SubmitTextReportUseCase:
    """Typed-text report with machine translation (for languages Bhashini cannot transcribe)."""

    def __init__(
        self, speech_translator: SpeechTranslationPort, reporting: ReportingModulePort
    ) -> None:
        self.speech_translator = speech_translator
        self.reporting = reporting

    async def execute(
        self,
        principal: PrincipalContext,
        text: str,
        source_language: str,
        location: LocationPoint,
        report_type: ReportType | None = None,
        severity: ReportSeverity | None = None,
        observed_at: datetime | None = None,
        client_operation_id: str | None = None,
        target_language: str = "en",
    ) -> VoiceReportResult:
        _precheck(location, severity, report_type)
        replay = await _replay(self.reporting, principal, client_operation_id)
        if replay is not None:
            return replay

        translation = await self.speech_translator.translate_text(
            text=text, source_language=source_language, target_language=target_language
        )
        transcript = VoiceTranscript(
            source_language=translation.source_language,
            target_language=translation.target_language,
            transcribed_text=translation.source_text,
            translated_text=translation.translated_text,
            model_status=translation.model_status,
        )
        return await _submit_from_transcript(
            self.reporting, principal, transcript, TEXT_REPORT_PREFIX, location,
            report_type, severity, observed_at, client_operation_id,
        )  # fmt: skip
