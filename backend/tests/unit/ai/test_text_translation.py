"""
tests/unit/ai/test_text_translation.py — typed-text translation (no ASR) and text reports.

Bhashini offers translation but no speech recognition for Assamese, Manipuri, Bodo and Nepali, so
officers in those languages report by typing. Client behaviour is checked against a mocked transport
(payload shapes confirmed live on 2026-09-25); the use cases share the voice-report safety rules.
"""

from __future__ import annotations

import json
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.modules.ai.application.ports import SpeechTranslationPort
from app.modules.ai.application.submit_voice_report import SubmitTextReportUseCase
from app.modules.ai.application.translate_text import TranslateTextUseCase
from app.modules.ai.domain.entities import TextTranslation, VoiceTranscript
from app.modules.ai.domain.enums import ModelStatus
from app.modules.ai.domain.exceptions import (
    InvalidFeatureVectorError,
    ModelNotLoadedError,
    SpeechServiceUnavailableError,
    UnsupportedLanguageError,
    VoiceReportInputError,
)
from app.modules.ai.domain.voice_report import (
    TEXT_REPORT_PREFIX,
    build_voice_report_description,
    suggest_report_type,
)
from app.modules.ai.infrastructure.bhashini_client import BhashiniClient
from app.modules.reporting.public import (
    LocationPoint,
    ReportingModulePort,
    ReportSeverity,
    ReportType,
)

CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
CALLBACK_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"
ASSAMESE = "ৰাস্তাত ভূমিধস হৈছে"
LOC = LocationPoint(longitude=91.75, latitude=26.15, accuracy_m=25.0)


def _client(handler: Any) -> BhashiniClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return BhashiniClient("", "key", "pipe", CONFIG_URL, inference_key="inf", http_client=http)


def _ok_handler(seen: list[dict[str, Any]]) -> Any:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.read())
        seen.append({"url": str(request.url), "body": body})
        if str(request.url) == CONFIG_URL:
            return httpx.Response(
                200,
                json={
                    "pipelineResponseConfig": [
                        {"taskType": "translation", "config": [{"serviceId": "translate-svc"}]}
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "pipelineResponse": [
                    {
                        "taskType": "translation",
                        "output": [{"source": ASSAMESE, "target": "There is a landslide"}],
                    }
                ]
            },
        )

    return handler


class TestBhashiniTranslateText:
    async def test_translation_only_request_shape(self) -> None:
        seen: list[dict[str, Any]] = []
        client = _client(_ok_handler(seen))
        try:
            result = await client.translate_text(ASSAMESE, "as", "en")
        finally:
            await client.aclose()
        assert result.translated_text == "There is a landslide"
        assert result.source_text == ASSAMESE and result.model_status is ModelStatus.LOADED
        config_tasks = seen[0]["body"]["pipelineTasks"]
        assert [t["taskType"] for t in config_tasks] == ["translation"]  # no ASR task
        assert config_tasks[0]["config"]["language"] == {
            "sourceLanguage": "as",
            "targetLanguage": "en",
        }
        compute = seen[1]["body"]
        assert compute["inputData"] == {"input": [{"source": ASSAMESE}]}
        assert compute["pipelineTasks"][0]["config"]["serviceId"] == "translate-svc"

    async def test_same_language_makes_no_api_call(self) -> None:
        seen: list[dict[str, Any]] = []
        client = _client(_ok_handler(seen))
        try:
            result = await client.translate_text("hello", "en", "en")
        finally:
            await client.aclose()
        assert result.translated_text == "hello" and seen == []

    async def test_empty_text_rejected(self) -> None:
        client = _client(_ok_handler([]))
        try:
            with pytest.raises(InvalidFeatureVectorError):
                await client.translate_text("   ", "as", "en")
        finally:
            await client.aclose()

    async def test_unsupported_language_is_clean_422_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                400, json={"message": "No supported tasks found for this request!!"}
            )

        client = _client(handler)
        try:
            with pytest.raises(UnsupportedLanguageError):
                await client.translate_text("text", "kha", "en")
        finally:
            await client.aclose()

    async def test_provider_failure_is_clean_502_error(self) -> None:
        client = _client(lambda request: httpx.Response(500, text="boom"))
        try:
            with pytest.raises(SpeechServiceUnavailableError):
                await client.translate_text("text", "as", "en")
        finally:
            await client.aclose()


class TestTranslateTextUseCase:
    async def test_delegates_to_translator(self) -> None:
        translator = AsyncMock(spec=SpeechTranslationPort)
        translator.translate_text.return_value = TextTranslation(
            "as", "en", "x", "y", ModelStatus.LOADED
        )
        result = await TranslateTextUseCase(translator).execute("x", "as")
        assert result.translated_text == "y"
        translator.translate_text.assert_awaited_once_with(
            text="x", source_language="as", target_language="en"
        )

    async def test_rejects_blank_text_and_language(self) -> None:
        uc = TranslateTextUseCase(AsyncMock(spec=SpeechTranslationPort))
        with pytest.raises(InvalidFeatureVectorError):
            await uc.execute("  ", "as")
        with pytest.raises(InvalidFeatureVectorError):
            await uc.execute("x", "")


def _text_uc(
    translation: TextTranslation | None = None,
) -> tuple[SubmitTextReportUseCase, Any, Any, Any]:
    translator = AsyncMock(spec=SpeechTranslationPort)
    translator.translate_text.return_value = translation or TextTranslation(
        "as", "en", ASSAMESE, "There is a landslide on the road", ModelStatus.LOADED
    )
    reporting = AsyncMock(spec=ReportingModulePort)
    reporting.find_report_by_operation_id.return_value = None
    reporting.submit_report.side_effect = lambda **kw: MagicMock(**kw)
    principal = MagicMock(user_id=uuid.uuid4())
    return SubmitTextReportUseCase(translator, reporting), translator, reporting, principal


class TestSubmitTextReport:
    async def test_translates_flags_inferred_fields_and_tags_provenance(self) -> None:
        uc, _, reporting, principal = _text_uc()
        result = await uc.execute(principal, ASSAMESE, "as", LOC)
        kw = reporting.submit_report.await_args.kwargs
        assert kw["report_type"] is ReportType.LANDSLIDE and kw["severity"] is ReportSeverity.MEDIUM
        assert kw["description"].startswith(TEXT_REPORT_PREFIX)
        assert "There is a landslide on the road" in kw["description"]
        assert f"Original (as): {ASSAMESE}" in kw["description"]
        assert result.report_type_inferred and result.severity_defaulted

    async def test_high_severity_needs_explicit_type_before_any_provider_call(self) -> None:
        uc, translator, reporting, principal = _text_uc()
        with pytest.raises(VoiceReportInputError):
            await uc.execute(principal, ASSAMESE, "as", LOC, None, ReportSeverity.HIGH)
        translator.translate_text.assert_not_awaited()
        reporting.submit_report.assert_not_awaited()

    async def test_stub_provider_creates_no_report(self) -> None:
        uc, _, reporting, principal = _text_uc(
            TextTranslation("as", "en", ASSAMESE, "", ModelStatus.STUB)
        )
        with pytest.raises(ModelNotLoadedError):
            await uc.execute(principal, ASSAMESE, "as", LOC)
        reporting.submit_report.assert_not_awaited()

    async def test_replay_skips_translation(self) -> None:
        uc, translator, reporting, principal = _text_uc()
        reporting.find_report_by_operation_id.return_value = MagicMock()
        result = await uc.execute(principal, ASSAMESE, "as", LOC, client_operation_id="op")
        assert result.replayed
        translator.translate_text.assert_not_awaited()


class TestDomainAdditions:
    def test_bridge_broken_phrasing_suggests_bridge_collapse(self) -> None:
        assert suggest_report_type("The bridge is broken, cars can't go") == "BRIDGE_COLLAPSE"

    def test_prefix_can_be_overridden(self) -> None:
        t = VoiceTranscript("as", "en", "orig", "translated", ModelStatus.LOADED)
        assert build_voice_report_description(t, prefix=TEXT_REPORT_PREFIX).startswith(
            TEXT_REPORT_PREFIX
        )
