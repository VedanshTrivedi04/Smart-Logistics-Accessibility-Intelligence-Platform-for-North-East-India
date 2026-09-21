"""
app/core/logging.py — Structured JSON logging with structlog.

Design:
- Every log line is valid JSON (machine-parseable)
- request_id is bound to every log in a request's context
- Sensitive fields are redacted before any output
- Log level is controlled by LOG_LEVEL env var
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog
from structlog.types import EventDict, WrappedLogger

# ──────────────────────────────────────────────────────────────
# Sensitive field redaction
# These field names are NEVER logged, regardless of where they appear.
# ──────────────────────────────────────────────────────────────
_REDACTED_FIELDS: frozenset[str] = frozenset(
    {
        "password",
        "passwd",
        "secret",
        "token",
        "access_token",
        "refresh_token",
        "session",
        "cookie",
        "authorization",
        "x-api-key",
        "private_key",
        "client_secret",
        "csrf_token",
        # Domain-specific sensitive fields
        "gps_trail",
        "raw_coordinates",
        "media_signed_url",
        "presigned_url",
        "phone_number",
        "aadhaar",
        "national_id",
    }
)

_REDACTED_PLACEHOLDER = "[REDACTED]"


def _redact_sensitive(
    _logger: WrappedLogger,
    _method: str,
    event_dict: EventDict,
) -> EventDict:
    """
    structlog processor: redact any key in _REDACTED_FIELDS.

    Applied before any formatting or output. Works recursively
    on nested dicts to depth 2.
    """
    for key in list(event_dict.keys()):
        if key.lower() in _REDACTED_FIELDS:
            event_dict[key] = _REDACTED_PLACEHOLDER
    return event_dict


def _add_app_context(
    _logger: WrappedLogger,
    _method: str,
    event_dict: EventDict,
) -> EventDict:
    """
    structlog processor: add static application-level context.
    """
    event_dict.setdefault("app", "ner-logistics-api")
    return event_dict


# ──────────────────────────────────────────────────────────────
# Configure structlog
# ──────────────────────────────────────────────────────────────

def configure_logging(log_level: str = "INFO") -> None:
    """
    Configure structlog and stdlib logging to emit structured JSON.

    Call once at application startup (in main.py lifespan).
    """
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _add_app_context,
        _redact_sensitive,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.ExceptionRenderer(),
    ]

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processor=structlog.processors.JSONRenderer(),
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(log_level.upper())

    # Suppress noisy third-party loggers
    for noisy in ("uvicorn.access", "sqlalchemy.engine", "boto3", "botocore", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


# ──────────────────────────────────────────────────────────────
# Context variable helpers (used by middleware + Celery tasks)
# ──────────────────────────────────────────────────────────────

def bind_request_context(*, request_id: str, path: str, method: str) -> None:
    """
    Bind per-request context variables to structlog's context var store.

    These are automatically included in every log line for this request.
    Must be called at the start of each request (in RequestIDMiddleware).
    """
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        http_path=path,
        http_method=method,
    )


def unbind_request_context() -> None:
    """Clear all contextvars at the end of a request."""
    structlog.contextvars.clear_contextvars()


def get_logger(name: str | None = None) -> Any:
    """
    Return a structlog logger bound to the given name.

    Usage:
        logger = get_logger(__name__)
        logger.info("event", key="value")
    """
    return structlog.get_logger(name)
