"""
app/core/middleware.py — Request-level middleware stack.

Middlewares (applied in order, outermost first):
  1. RequestIDMiddleware  — generates/propagates X-Request-ID, binds structlog context
  2. TrustedHostMiddleware — rejects requests with invalid Host headers
  3. CORSMiddleware — restricts cross-origin access to configured origins

NOTE: Starlette applies middleware in REVERSE order of addition.
      The LAST middleware added is the OUTERMOST (first to run).
"""

from __future__ import annotations

import uuid

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.logging import bind_request_context, get_logger, unbind_request_context

logger = get_logger(__name__)


# ──────────────────────────────────────────────────────────────
# Request ID Middleware
# ──────────────────────────────────────────────────────────────

class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Assigns a unique UUID to every request and propagates it through:
    - request.state.request_id (accessible in route handlers and dependencies)
    - X-Request-ID response header (visible to clients for debugging)
    - structlog context (automatically included in every log line for this request)

    If the client sends X-Request-ID, we validate it's a valid UUID and use it.
    Otherwise we generate a new one. This allows tracing across service boundaries.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        # Accept client-provided request ID if it's a valid UUID; otherwise generate
        client_id = request.headers.get("X-Request-ID", "")
        try:
            request_id = str(uuid.UUID(client_id))
        except ValueError:
            request_id = str(uuid.uuid4())

        # Store on request state for access in handlers/dependencies
        request.state.request_id = request_id

        # Bind to structlog context for automatic inclusion in all logs
        bind_request_context(
            request_id=request_id,
            path=request.url.path,
            method=request.method,
        )

        try:
            response = await call_next(request)
        except Exception:
            logger.exception("request_failed", request_id=request_id)
            raise
        finally:
            unbind_request_context()

        # Propagate in response for client-side debugging
        response.headers["X-Request-ID"] = request_id
        return response


# ──────────────────────────────────────────────────────────────
# Middleware registration
# ──────────────────────────────────────────────────────────────

def register_middleware(app: FastAPI, *, allowed_origins: list[str]) -> None:
    """
    Register all middleware on the FastAPI app.

    Call this in main.py AFTER creating the app, BEFORE adding routes.
    Order here is outermost-last (Starlette reverses order on execution).
    """
    # 1. CORS — restricts browser cross-origin requests
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,  # Required for HttpOnly cookie auth
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Request-ID", "X-CSRF-Token", "If-Match"],
        expose_headers=["X-Request-ID"],
    )

    # 2. Trusted Host — rejects Host-header injection attacks
    # In development, localhost is allowed. In production, set explicit domains.
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["localhost", "127.0.0.1", "*.neon.tech", "*"],
        # NOTE: Tighten this list in production to your actual domain(s)
    )

    # 3. Request ID — must be outermost (last added = first to run)
    app.add_middleware(RequestIDMiddleware)
