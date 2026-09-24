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
