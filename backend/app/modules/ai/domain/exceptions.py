"""
app/modules/ai/domain/exceptions.py — Domain Exceptions for AI/ML Module.
"""

from __future__ import annotations

from app.core.exceptions import AppError, UnprocessableError, ValidationError


class AiDomainError(AppError):
    """Base exception for all AI/ML domain errors."""
    code = "AI_ERROR"


class ModelNotLoadedError(UnprocessableError):
    """Raised when a real model artifact is required but only the stub backend is available."""
    code = "MODEL_NOT_LOADED"


class InvalidFeatureVectorError(ValidationError):
    """Raised when required features are missing or out of expected range for inference."""
    code = "INVALID_FEATURE_VECTOR"


class MediaObjectUnavailableError(UnprocessableError):
    """Raised when a report's media row exists but its stored object cannot be fetched."""
    code = "MEDIA_OBJECT_UNAVAILABLE"


class UnsupportedLanguageError(UnprocessableError):
    """Raised when the speech provider has no ASR/translation for the requested language pair."""
    code = "UNSUPPORTED_LANGUAGE"


class SpeechServiceUnavailableError(AppError):
    """Raised when the upstream speech provider fails, times out, or is unreachable (502)."""
    http_status = 502
    code = "SPEECH_SERVICE_UNAVAILABLE"


class EmptyTranscriptError(UnprocessableError):
    """Raised when speech recognition returned no usable text; no report is created from it."""
    code = "EMPTY_TRANSCRIPT"


class VoiceReportInputError(ValidationError):
    """Raised when a voice-report request combines fields in an unsafe or invalid way."""
    code = "INVALID_VOICE_REPORT"
