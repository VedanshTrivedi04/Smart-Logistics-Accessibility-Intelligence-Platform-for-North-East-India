"""
app/modules/ai/infrastructure/bhashini_client.py — Speech translation adapter (Module 4).

Implements the National Language Translation Mission's Bhashini ULCA two-step
API flow, verified against Bhashini's own GitBook documentation
(bhashini.gitbook.io/bhashini-apis) and a working reference client, since this
project has no registered Bhashini account/API key to test against live:

  1. Pipeline Config Call (POST BHASHINI_CONFIG_URL, headers `userID` +
     `ulcaApiKey`) — resolves a pipelineId + task list into per-task
     serviceIds and the actual inference endpoint + its auth header
     (`pipelineInferenceAPIEndPoint.callbackUrl` /
     `.inferenceApiKey.{name,value}`).
  2. Pipeline Compute Call (POST the resolved callbackUrl, with the resolved
     auth header) — runs the actual ASR + translation task sequence and
     returns `pipelineResponse[i].output[...]`.

**Verification status**: exercised against Bhashini's LIVE servers on 2026-09-25 (Hindi TTS ->
ASR -> Hindi->English translation round trip via a real ULCA key; the config call must carry the
languages, otherwise Bhashini returns Bengali defaults). Offered with that key/pipeline: ASR for
hi/bn/en (NOT Assamese, Manipuri, Bodo, Nepali, Khasi, Mizo); text translation to English for as,
mni, brx, ne, hi, bn (not kha/lus). Provider failures map to UnsupportedLanguageError (422) /
SpeechServiceUnavailableError (502). Without BHASHINI_API_KEY, get_speech_translation_port()
falls back to the stub, like the Module 1/2/3 adapters.
"""

from __future__ import annotations

import base64
import re
from functools import lru_cache
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.modules.ai.application.ports import SpeechTranslationPort
from app.modules.ai.domain.entities import TextTranslation, VoiceTranscript
from app.modules.ai.domain.enums import ModelStatus
from app.modules.ai.domain.exceptions import (
    InvalidFeatureVectorError,
    ModelNotLoadedError,
    SpeechServiceUnavailableError,
    UnsupportedLanguageError,
)

logger = get_logger(__name__)

DEFAULT_TIMEOUT_SECONDS = 30.0
# Bhashini answers HTTP 400 with these messages when a language/task combination is not offered.
_UNSUPPORTED_MARKERS = re.compile(r"not supported|No supported tasks", re.IGNORECASE)


class StubSpeechTranslationPort(SpeechTranslationPort):
    """Stub adapter for SpeechTranslationPort. No Bhashini credentials configured."""

    async def transcribe_and_translate(
        self,
        audio_bytes: bytes,
        source_language: str,
        target_language: str = "en",
    ) -> VoiceTranscript:
        return VoiceTranscript(
            source_language=source_language,
            target_language=target_language,
            transcribed_text="",
            translated_text="",
            model_status=ModelStatus.STUB,
        )

    async def translate_text(
        self,
        text: str,
        source_language: str,
        target_language: str = "en",
    ) -> TextTranslation:
        return TextTranslation(
            source_language=source_language,
            target_language=target_language,
            source_text=text,
            translated_text="",
            model_status=ModelStatus.STUB,
        )


class BhashiniClient(SpeechTranslationPort):
    """Real adapter for SpeechTranslationPort, backed by the Bhashini ULCA API."""

    def __init__(
        self,
        user_id: str = "",
        api_key: str = "",
        pipeline_id: str = "",
        config_url: str = "",
        *,
        inference_key: str = "",
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        if not api_key:
            raise ModelNotLoadedError(
                "BHASHINI_API_KEY (Udyat Key) not configured — "
                "obtain it from https://dashboard.bhashini.co.in"
            )
        self.user_id = user_id
        self.api_key = api_key
        self.pipeline_id = pipeline_id
        self.config_url = config_url
        self.inference_key = inference_key
        self._owns_client = http_client is None
        self.http_client = http_client or httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS)

    async def _post(
        self, url: str, *, headers: dict[str, str], json: dict[str, Any], step: str, pair: str
    ) -> httpx.Response:
        """POST to Bhashini; provider failures become clean domain errors, never a raw 500."""
        try:
            response = await self.http_client.post(url, headers=headers, json=json)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status == 400 and _UNSUPPORTED_MARKERS.search(exc.response.text):
                raise UnsupportedLanguageError(
                    f"Bhashini offers no speech recognition/translation for {pair}"
                ) from exc
            logger.warning("bhashini_upstream_error", step=step, status=status)
            raise SpeechServiceUnavailableError(f"Bhashini {step} failed (HTTP {status})") from exc
        except httpx.RequestError as exc:
            logger.warning("bhashini_unreachable", step=step, error=type(exc).__name__)
            raise SpeechServiceUnavailableError(
                f"Bhashini {step} unreachable ({type(exc).__name__})"
            ) from exc
        return response

    async def _get_pipeline_config(
        self, source: str, target: str, *, include_asr: bool = True
    ) -> dict[str, Any]:
        """Config call. Languages MUST be sent: without them Bhashini returns Bengali defaults."""
        tasks: list[dict[str, Any]] = (
            [{"taskType": "asr", "config": {"language": {"sourceLanguage": source}}}]
            if include_asr
            else []
        )
        if target != source:
            tasks.append(
                {
                    "taskType": "translation",
                    "config": {"language": {"sourceLanguage": source, "targetLanguage": target}},
                }
            )
        headers: dict[str, str] = {"ulcaApiKey": self.api_key}
        if self.user_id:
            headers["userID"] = self.user_id
        response = await self._post(
            self.config_url,
            headers=headers,
            json={
                "pipelineTasks": tasks,
                "pipelineRequestConfig": {"pipelineId": self.pipeline_id},
            },
            step="pipeline-config",
            pair=f"'{source}' -> '{target}'",
        )
        result: dict[str, Any] = response.json()
        return result

    @staticmethod
    def _service_id_for_task(config_response: dict[str, Any], task_type: str) -> str:
        for entry in config_response.get("pipelineResponseConfig", []):
            if entry.get("taskType") == task_type:
                configs = entry.get("config", [])
                if configs:
                    service_id = configs[0].get("serviceId")
                    if service_id:
                        return str(service_id)
        raise InvalidFeatureVectorError(
            f"Bhashini pipeline config did not return a serviceId for task '{task_type}'"
        )

    def _inference_endpoint(self, config_response: dict[str, Any]) -> tuple[str, str, str]:
        endpoint_info = config_response.get("pipelineInferenceAPIEndPoint") or {}
        callback_url = (
            endpoint_info.get("callbackUrl")
            or "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"
        )
        inference_key = endpoint_info.get("inferenceApiKey") or {}
        header_name = inference_key.get("name") or "Authorization"
        header_value = inference_key.get("value") or self.inference_key
        if not (callback_url and header_name and header_value):
            raise InvalidFeatureVectorError(
                "Bhashini pipeline config response missing pipelineInferenceAPIEndPoint details"
            )
        return str(callback_url), str(header_name), str(header_value)

    async def transcribe_and_translate(
        self,
        audio_bytes: bytes,
        source_language: str,
        target_language: str = "en",
    ) -> VoiceTranscript:
        if not audio_bytes:
            raise InvalidFeatureVectorError("audio_bytes must not be empty")

        translate = target_language != source_language
        config_response = await self._get_pipeline_config(source_language, target_language)
        asr_service_id = self._service_id_for_task(config_response, "asr")
        callback_url, header_name, header_value = self._inference_endpoint(config_response)

        tasks: list[dict[str, Any]] = [
            {
                "taskType": "asr",
                "config": {
                    "language": {"sourceLanguage": source_language},
                    "serviceId": asr_service_id,
                    "audioFormat": "wav",
                    "samplingRate": 16000,
                },
            }
        ]
        if translate:
            tasks.append(
                {
                    "taskType": "translation",
                    "config": {
                        "language": {
                            "sourceLanguage": source_language,
                            "targetLanguage": target_language,
                        },
                        "serviceId": self._service_id_for_task(config_response, "translation"),
                    },
                }
            )
        compute_body = {
            "pipelineTasks": tasks,
            "inputData": {
                "audio": [{"audioContent": base64.b64encode(audio_bytes).decode("ascii")}]
            },
        }

        compute_response = await self._post(
            callback_url,
            headers={header_name: header_value},
            json=compute_body,
            step="pipeline-compute",
            pair=f"'{source_language}' -> '{target_language}'",
        )
        pipeline_response = compute_response.json().get("pipelineResponse", [])

        transcribed_text = self._extract_output(pipeline_response, "asr", "source")
        translated_text = (
            self._extract_output(pipeline_response, "translation", "target")
            if translate
            else transcribed_text
        )

        return VoiceTranscript(
            source_language=source_language,
            target_language=target_language,
            transcribed_text=transcribed_text,
            translated_text=translated_text,
            model_status=ModelStatus.LOADED,
        )

    async def translate_text(
        self,
        text: str,
        source_language: str,
        target_language: str = "en",
    ) -> TextTranslation:
        """Translation-only pipeline call (no ASR). Same language -> returned as-is, no API call."""
        if not text or not text.strip():
            raise InvalidFeatureVectorError("text must not be empty")
        if source_language == target_language:
            return TextTranslation(
                source_language, target_language, text, text, ModelStatus.LOADED
            )

        config_response = await self._get_pipeline_config(
            source_language, target_language, include_asr=False
        )
        service_id = self._service_id_for_task(config_response, "translation")
        callback_url, header_name, header_value = self._inference_endpoint(config_response)
        response = await self._post(
            callback_url,
            headers={header_name: header_value},
            json={
                "pipelineTasks": [
                    {
                        "taskType": "translation",
                        "config": {
                            "language": {
                                "sourceLanguage": source_language,
                                "targetLanguage": target_language,
                            },
                            "serviceId": service_id,
                        },
                    }
                ],
                "inputData": {"input": [{"source": text}]},
            },
            step="pipeline-compute",
            pair=f"'{source_language}' -> '{target_language}'",
        )
        translated = self._extract_output(
            response.json().get("pipelineResponse", []), "translation", "target"
        )
        return TextTranslation(
            source_language, target_language, text, translated, ModelStatus.LOADED
        )

    @staticmethod
    def _extract_output(
        pipeline_response: list[dict[str, Any]], task_type: str, field: str
    ) -> str:
        for task_result in pipeline_response:
            if task_result.get("taskType") == task_type:
                output = task_result.get("output", [])
                if output:
                    return str(output[0].get(field, ""))
        raise InvalidFeatureVectorError(
            f"Bhashini compute response missing '{field}' output for task '{task_type}'"
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self.http_client.aclose()


@lru_cache(maxsize=1)
def get_speech_translation_port() -> SpeechTranslationPort:
    """Build the real Bhashini client once per process, falling back to the stub."""
    settings = get_settings()
    try:
        return BhashiniClient(
            user_id=settings.BHASHINI_USER_ID,
            api_key=settings.BHASHINI_API_KEY,
            pipeline_id=settings.BHASHINI_PIPELINE_ID,
            config_url=settings.BHASHINI_CONFIG_URL,
            inference_key=settings.BHASHINI_INFERENCE_KEY,
        )
    except ModelNotLoadedError:
        logger.warning("bhashini_not_configured_using_stub")
    return StubSpeechTranslationPort()
