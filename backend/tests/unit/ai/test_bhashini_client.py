"""
tests/unit/ai/test_bhashini_client.py — Unit Tests for the Bhashini Speech Translation Adapter.

No live Bhashini account/API key exists for this project, so these tests use
httpx.MockTransport to verify BhashiniClient's request construction and
response parsing against the real, documented Bhashini ULCA payload shapes —
without ever hitting the network.
"""

from __future__ import annotations

import base64

import httpx
import pytest

from app.modules.ai.domain.enums import ModelStatus
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError, ModelNotLoadedError
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
    def test_missing_user_id_raises(self) -> None:
        with pytest.raises(ModelNotLoadedError):
            BhashiniClient(user_id="", api_key="k", pipeline_id="p", config_url=CONFIG_URL)

    def test_missing_api_key_raises(self) -> None:
        with pytest.raises(ModelNotLoadedError):
            BhashiniClient(user_id="u", api_key="", pipeline_id="p", config_url=CONFIG_URL)


class TestBhashiniClientRealFlow:
    async def test_full_transcribe_and_translate_flow(self) -> None:
        client = make_client()
        try:
            result = await client.transcribe_and_translate(
                audio_bytes=b"fake-wav-bytes", source_language="as", target_language="en"
            )
            assert result.transcribed_text == "landslide near NH-6"
            assert result.translated_text == "Landslide near NH-6"
            assert result.source_language == "as"
            assert result.target_language == "en"
            assert result.model_status is ModelStatus.LOADED
        finally:
            await client.aclose()

    async def test_empty_audio_rejected(self) -> None:
        client = make_client()
        try:
            with pytest.raises(InvalidFeatureVectorError):
                await client.transcribe_and_translate(b"", "as", "en")
        finally:
            await client.aclose()

    async def test_missing_service_id_in_config_raises(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"pipelineResponseConfig": []})

        http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        client = BhashiniClient("u", "k", "p", CONFIG_URL, http_client=http_client)
        try:
            with pytest.raises(InvalidFeatureVectorError):
                await client.transcribe_and_translate(b"audio", "as", "en")
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
                await client.transcribe_and_translate(b"audio", "as", "en")
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
