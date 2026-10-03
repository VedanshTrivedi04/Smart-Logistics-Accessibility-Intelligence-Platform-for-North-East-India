"""
tests/unit/reporting/test_router_commits.py — Write endpoints must commit their transaction.

get_db() never commits, so an endpoint that forgets `await db.commit()` looks successful to the client
(201 / "accepted") while every row is rolled back when the request ends. That is exactly how field
reports and their photos silently disappeared, so this is guarded explicitly.
"""

from __future__ import annotations

import importlib
import inspect
import uuid
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.storage import MockStorageService
from app.modules.reporting.api.schemas import UploadTicketRequest

# The packages re-export `router` (an APIRouter) over the module name, so load the modules explicitly.
reporting_module = importlib.import_module("app.modules.reporting.api.router")
incidents_module = importlib.import_module("app.modules.incidents.api.router")
logistics_module = importlib.import_module("app.modules.logistics.api.router")
telemetry_module = importlib.import_module("app.modules.telemetry.api.router")
impact_module = importlib.import_module("app.modules.impact.api.router")


def _write_routes(router: Any) -> list[Any]:
    return [r for r in router.routes if getattr(r, "methods", None) and r.methods & {"POST", "PUT", "PATCH", "DELETE"}]


@pytest.mark.parametrize(
    "router",
    [reporting_module.router, incidents_module.router, logistics_module.router, telemetry_module.router, impact_module.router],
    ids=["reporting", "incidents", "logistics", "telemetry", "impact"],
)
def test_every_write_endpoint_commits(router: Any) -> None:
    routes = _write_routes(router)
    assert routes, "expected write endpoints"
    missing = [r.path for r in routes if ".commit()" not in inspect.getsource(r.endpoint)]
    assert missing == [], f"write endpoints that never commit (their changes are rolled back): {missing}"


async def test_upload_ticket_commits_the_media_row(monkeypatch: pytest.MonkeyPatch) -> None:
    # The confirm call arrives in a later request; the media row must already be durable by then.
    monkeypatch.setattr("app.modules.reporting.application.media_service.get_storage_service", lambda: MockStorageService())
    order: list[str] = []
    db = MagicMock()
    db.add = MagicMock(side_effect=lambda *_: order.append("add"))
    db.flush = AsyncMock(side_effect=lambda *_: order.append("flush"))
    db.commit = AsyncMock(side_effect=lambda *_: order.append("commit"))

    principal = SimpleNamespace(user_id=uuid.uuid4())
    req = UploadTicketRequest(file_name="p.jpg", file_size_bytes=1000, mime_type="image/jpeg", checksum_sha256="a" * 64)

    ticket = await reporting_module.request_upload_ticket(req, db=db, principal=principal)  # type: ignore[arg-type]

    assert ticket.upload_method == "PUT"
    # The row is added and flushed, and only then committed.
    assert order == ["add", "flush", "commit"]
