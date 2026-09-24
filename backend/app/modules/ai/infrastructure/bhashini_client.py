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

**Honesty note**: this has been verified for request/response *shape*
correctness (matches documented and real-world-reference payloads) and unit
tested against a mocked HTTP transport — it has NOT been exercised against
Bhashini's live servers, since doing so requires a registered ULCA account
this project does not have. Wire in real `BHASHINI_USER_ID`/`BHASHINI_API_KEY`
(see app/core/config.py) to use for real; until then,
get_speech_translation_port() falls back to the stub, exactly like the
Module 1/2/3 adapters fall back when their model artifacts are absent.
"""

from __future__ import annotations

import base64
from functools import lru_cache
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.modules.ai.application.ports import SpeechTranslationPort
from app.modules.ai.domain.entities import VoiceTranscript
from app.modules.ai.domain.enums import ModelStatus
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError, ModelNotLoadedError

logger = get_logger(__name__)

DEFAULT_TIMEOUT_SECONDS = 30.0


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


class BhashiniClient(SpeechTranslationPort):
    """Real adapter for SpeechTranslationPort, backed by the Bhashini ULCA API."""

    def __init__(
        self,
        user_id: str,
        api_key: str,
        pipeline_id: str,
        config_url: str,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        if not user_id or not api_key:
            raise ModelNotLoadedError(
                "BHASHINI_USER_ID/BHASHINI_API_KEY not configured — "
                "register a pipeline at https://bhashini.gov.in to obtain them"
            )
        self.user_id = user_id
        self.api_key = api_key
        self.pipeline_id = pipeline_id
        self.config_url = config_url
        self._owns_client = http_client is None
        self.http_client = http_client or httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS)

    async def _get_pipeline_config(self, task_types: list[str]) -> dict[str, Any]:
        response = await self.http_client.post(
            self.config_url,
            headers={"userID": self.user_id, "ulcaApiKey": self.api_key},
            json={
                "pipelineTasks": [{"taskType": t} for t in task_types],
                "pipelineRequestConfig": {"pipelineId": self.pipeline_id},
            },
        )
        response.raise_for_status()
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

    @staticmethod
    def _inference_endpoint(config_response: dict[str, Any]) -> tuple[str, str, str]:
        endpoint_info = config_response.get("pipelineInferenceAPIEndPoint", {})
        callback_url = endpoint_info.get("callbackUrl")
        inference_key = endpoint_info.get("inferenceApiKey", {})
        header_name = inference_key.get("name")
        header_value = inference_key.get("value")
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

        config_response = await self._get_pipeline_config(["asr", "translation"])
        asr_service_id = self._service_id_for_task(config_response, "asr")
        translation_service_id = self._service_id_for_task(config_response, "translation")
        callback_url, header_name, header_value = self._inference_endpoint(config_response)

        compute_body = {
            "pipelineTasks": [
                {
                    "taskType": "asr",
                    "config": {
                        "language": {"sourceLanguage": source_language},
                        "serviceId": asr_service_id,
                        "audioFormat": "wav",
                        "samplingRate": 16000,
                    },
                },
                {
                    "taskType": "translation",
                    "config": {
                        "language": {
                            "sourceLanguage": source_language,
                            "targetLanguage": target_language,
                        },
                        "serviceId": translation_service_id,
                    },
                },
            ],
            "inputData": {
                "audio": [{"audioContent": base64.b64encode(audio_bytes).decode("ascii")}]
            },
        }

        compute_response = await self.http_client.post(
            callback_url,
            headers={header_name: header_value},
            json=compute_body,
        )
        compute_response.raise_for_status()
        pipeline_response = compute_response.json().get("pipelineResponse", [])

        transcribed_text = self._extract_output(pipeline_response, "asr", "source")
        translated_text = self._extract_output(pipeline_response, "translation", "target")

        return VoiceTranscript(
            source_language=source_language,
            target_language=target_language,
            transcribed_text=transcribed_text,
            translated_text=translated_text,
            model_status=ModelStatus.LOADED,
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
        )
    except ModelNotLoadedError:
        logger.warning("bhashini_not_configured_using_stub")
    return StubSpeechTranslationPort()
