"""
app/core/tracing.py — request_id propagation across async boundaries.

Ensures the request_id that enters via HTTP flows through:
  API handler → DB query log → Outbox payload → Celery task → Alert worker

This is NOT a full OpenTelemetry implementation.
It is a lightweight, stdlib-compatible tracing approach using:
  - contextvars for within-process propagation
  - Custom Celery headers for cross-process propagation
  - Outbox payload for DB-level persistence

Usage:
    # In API handler (request_id already in structlog context):
    propagate_request_id_to_celery(task.apply_async(...))

    # In Celery task:
    request_id = get_task_request_id(self.request)
    bind_task_context(request_id=request_id, task_name=self.name)
"""

from __future__ import annotations

import contextvars
from typing import Any

import structlog

# ──────────────────────────────────────────────────────────────
# Context variable (within-process)
# ──────────────────────────────────────────────────────────────

_request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default="unset"
)


def set_current_request_id(request_id: str) -> contextvars.Token[str]:
    """
    Set the current request_id in the context variable.

    Returns a token that can be used to reset to the previous value.
    """
    return _request_id_var.set(request_id)


def get_current_request_id() -> str:
    """
    Return the current request_id from the context variable.

    Returns "unset" if not set (e.g., in background tasks without propagation).
    """
    return _request_id_var.get()


def reset_request_id(token: contextvars.Token[str]) -> None:
    """Reset the context variable to its previous value."""
    _request_id_var.reset(token)


# ──────────────────────────────────────────────────────────────
# Celery cross-process propagation
# ──────────────────────────────────────────────────────────────

CELERY_HEADER_REQUEST_ID = "X-Request-ID"


def get_celery_task_headers() -> dict[str, str]:
    """
    Build Celery task headers that propagate the current request_id.

    Call this when dispatching a Celery task from an API handler:
        task.apply_async(args=[...], headers=get_celery_task_headers())
    """
    return {CELERY_HEADER_REQUEST_ID: get_current_request_id()}


def bind_task_context_from_headers(headers: dict[str, Any], *, task_name: str) -> None:
    """
    Bind structlog context in a Celery task using propagated headers.

    Call this at the start of every Celery task:
        bind_task_context_from_headers(self.request.headers or {}, task_name=self.name)
    """
    request_id = headers.get(CELERY_HEADER_REQUEST_ID, "background")
    set_current_request_id(request_id)
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        task_name=task_name,
        context="celery_worker",
    )


# ──────────────────────────────────────────────────────────────
# Outbox payload enrichment
# ──────────────────────────────────────────────────────────────

def enrich_outbox_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Add the current request_id to an outbox event payload.

    This persists the trace across database restarts and outbox replays,
    allowing incident investigation to connect a specific API call
    to the cascading events it produced.
    """
    return {**payload, "_trace_request_id": get_current_request_id()}
