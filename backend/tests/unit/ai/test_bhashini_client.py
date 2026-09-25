"""
tests/unit/ai/test_bhashini_client.py — Unit Tests for the Bhashini Speech Translation Adapter.

These tests use httpx.MockTransport to verify BhashiniClient's request construction, response
parsing and error mapping without hitting the network. The payload shapes were confirmed against
Bhashini's live API on 2026-09-25 (see the client module docstring).
"""

from __future__ import annotations

import base64

import httpx
import pytest

from app.modules.ai.domain.enums import ModelStatus
from app.modules.ai.domain.exceptions import (
    InvalidFeatureVectorError,
    ModelNotLoadedError,
    SpeechServiceUnavailableError,
    UnsupportedLanguageError,
)
from app.modules.ai.infrastructure.bhashini_client import (
    BhashiniClient,
    StubSpeechTranslationPort,
    get_speech_translation_port,
)

CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
CALLBACK_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"

CONFIG_RESPONSE = {
    "pipelineResponseConfig": [
        {"taskType": "asr", "config": [{"serviceId": "asr-service-1"}]},
        {"taskType": "translation", "config": [{"serviceId": "translation-service-1"}]},
    ],
    "pipelineInferenceAPIEndPoint": {
        "callbackUrl": CALLBACK_URL,
        "inferenceApiKey": {"name": "Authorization", "value": "test-inference-key"},
    },
}

COMPUTE_RESPONSE = {
    "pipelineResponse": [
        {"taskType": "asr", "output": [{"source": "landslide near NH-6"}]},
        {
            "taskType": "translation",
            "output": [{"source": "landslide near NH-6", "target": "Landslide near NH-6"}],
        },
    ]
}


def make_mock_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == CONFIG_URL:
            assert request.headers["userID"] == "test-user"
            assert request.headers["ulcaApiKey"] == "test-key"
            import json as _json

            tasks = _json.loads(request.read())["pipelineTasks"]
            # Bhashini falls back to Bengali defaults unless every task carries its language.
            assert tasks[0]["config"]["language"]["sourceLanguage"] == "hi"
            assert tasks[1]["config"]["language"] == {
                "sourceLanguage": "hi",
                "targetLanguage": "en",
            }
            return httpx.Response(200, json=CONFIG_RESPONSE)
        if str(request.url) == CALLBACK_URL:
            assert request.headers["authorization"] == "test-inference-key"
            body = request.read()
            import json

            payload = json.loads(body)
            audio_content = payload["inputData"]["audio"][0]["audioContent"]
            assert base64.b64decode(audio_content) == b"fake-wav-bytes"
            return httpx.Response(200, json=COMPUTE_RESPONSE)
        return httpx.Response(404)

    return httpx.MockTransport(handler)


def make_client() -> BhashiniClient:
    http_client = httpx.AsyncClient(transport=make_mock_transport())
    return BhashiniClient(
        user_id="test-user",
        api_key="test-key",
        pipeline_id="test-pipeline-id",
        config_url=CONFIG_URL,
        http_client=http_client,
    )


class TestStubSpeechTranslationPort:
    async def test_returns_empty_stub_transcript(self) -> None:
        port = StubSpeechTranslationPort()
        result = await port.transcribe_and_translate(b"audio", "as", "en")
        assert result.model_status is ModelStatus.STUB
        assert result.transcribed_text == ""
        assert result.translated_text == ""


class TestBhashiniClientMissingCredentials:
    def test_missing_api_key_raises(self) -> None:
        with pytest.raises(ModelNotLoadedError):
            BhashiniClient(user_id="u", api_key="", pipeline_id="p", config_url=CONFIG_URL)

    def test_optional_user_id_allowed(self) -> None:
        client = BhashiniClient(user_id="", api_key="k", pipeline_id="p", config_url=CONFIG_URL)
        assert client.user_id == ""
        assert client.api_key == "k"


class TestBhashiniClientRealFlow:
    async def test_full_transcribe_and_translate_flow(self) -> None:
        client = make_client()
        try:
            result = await client.transcribe_and_translate(
                audio_bytes=b"fake-wav-bytes", source_language="hi", target_language="en"
            )
            assert result.transcribed_text == "landslide near NH-6"
            assert result.translated_text == "Landslide near NH-6"
            assert result.source_language == "hi"
            assert result.target_language == "en"
            assert result.model_status is ModelStatus.LOADED
        finally:
            await client.aclose()

    async def test_empty_audio_rejected(self) -> None:
        client = make_client()
        try:
            with pytest.raises(InvalidFeatureVectorError):
                await client.transcribe_and_translate(b"", "hi", "en")
        finally:
            await client.aclose()

    async def test_missing_service_id_in_config_raises(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"pipelineResponseConfig": []})

        http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        client = BhashiniClient("u", "k", "p", CONFIG_URL, http_client=http_client)
        try:
            with pytest.raises(InvalidFeatureVectorError):
                await client.transcribe_and_translate(b"audio", "hi", "en")
        finally:
            await client.aclose()

    async def test_missing_inference_endpoint_in_config_raises(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "pipelineResponseConfig": [
                        {"taskType": "asr", "config": [{"serviceId": "a"}]},
                        {"taskType": "translation", "config": [{"serviceId": "b"}]},
                    ]
                },
            )

        http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        client = BhashiniClient("u", "k", "p", CONFIG_URL, http_client=http_client)
        try:
            with pytest.raises(InvalidFeatureVectorError):
                await client.transcribe_and_translate(b"audio", "hi", "en")
        finally:
            await client.aclose()

    async def test_custom_inference_key_fallback(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if str(request.url) == CONFIG_URL:
                return httpx.Response(
                    200,
                    json={
                        "pipelineResponseConfig": [
                            {"taskType": "asr", "config": [{"serviceId": "a"}]},
                            {"taskType": "translation", "config": [{"serviceId": "b"}]},
                        ],
                        "pipelineInferenceAPIEndPoint": {
                            "callbackUrl": CALLBACK_URL,
                            "inferenceApiKey": {"name": "Authorization", "value": ""},
                        },
                    },
                )
            if str(request.url) == CALLBACK_URL:
                assert request.headers["authorization"] == "my-fallback-key"
                return httpx.Response(200, json=COMPUTE_RESPONSE)
            return httpx.Response(404)

        http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        client = BhashiniClient(
            "u", "k", "p", CONFIG_URL, inference_key="my-fallback-key", http_client=http_client
        )
        try:
            res = await client.transcribe_and_translate(b"audio", "hi", "en")
            assert res.transcribed_text == "landslide near NH-6"
        finally:
            await client.aclose()


class TestGetSpeechTranslationPortFactory:
    def test_falls_back_to_stub_when_unconfigured(self, monkeypatch: pytest.MonkeyPatch) -> None:
        get_speech_translation_port.cache_clear()
        monkeypatch.setenv("BHASHINI_USER_ID", "")
        monkeypatch.setenv("BHASHINI_API_KEY", "")
        from app.core.config import get_settings

        get_settings.cache_clear()

        port = get_speech_translation_port()
        assert isinstance(port, StubSpeechTranslationPort)
        get_speech_translation_port.cache_clear()


def _client_with(handler) -> BhashiniClient:  # type: ignore[no-untyped-def]
    http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return BhashiniClient("u", "k", "p", CONFIG_URL, http_client=http_client)


class TestBhashiniErrorMapping:
    async def test_unsupported_language_maps_to_422_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                400,
                json={
                    "code": "400 BAD_REQUEST",
                    "message": "No supported tasks found for this request!!",
                },
            )

        client = _client_with(handler)
        try:
            with pytest.raises(UnsupportedLanguageError) as exc:
                await client.transcribe_and_translate(b"audio", "as", "en")
            assert exc.value.code == "UNSUPPORTED_LANGUAGE"
        finally:
            await client.aclose()

    async def test_unknown_language_message_maps_to_unsupported(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(400, json={"message": "xx sourceLanguage  is not supported ! "})

        client = _client_with(handler)
        try:
            with pytest.raises(UnsupportedLanguageError):
                await client.transcribe_and_translate(b"audio", "xx", "en")
        finally:
            await client.aclose()

    async def test_provider_5xx_maps_to_502_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="boom")

        client = _client_with(handler)
        try:
            with pytest.raises(SpeechServiceUnavailableError) as exc:
                await client.transcribe_and_translate(b"audio", "hi", "en")
            assert exc.value.http_status == 502
        finally:
            await client.aclose()

    async def test_timeout_maps_to_502_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectTimeout("slow", request=request)

        client = _client_with(handler)
        try:
            with pytest.raises(SpeechServiceUnavailableError):
                await client.transcribe_and_translate(b"audio", "hi", "en")
        finally:
            await client.aclose()

    async def test_same_language_skips_translation_task(self) -> None:
        seen: list[list[str]] = []

        def handler(request: httpx.Request) -> httpx.Response:
            import json as _json

            body = _json.loads(request.read())
            seen.append([t["taskType"] for t in body["pipelineTasks"]])
            if str(request.url) == CONFIG_URL:
                return httpx.Response(200, json=CONFIG_RESPONSE)
            return httpx.Response(
                200,
                json={"pipelineResponse": [{"taskType": "asr", "output": [{"source": "namaste"}]}]},
            )

        client = _client_with(handler)
        try:
            res = await client.transcribe_and_translate(b"audio", "hi", "hi")
            assert res.transcribed_text == res.translated_text == "namaste"
            assert seen == [["asr"], ["asr"]]  # config + compute both ASR-only
        finally:
            await client.aclose()
