"""
app/core/pagination.py — Cursor-based pagination for all list endpoints.

Policy (from implementation plan):
- All list endpoints use cursor-based pagination (no offset integers)
- Cursors are opaque: encode (sort_field_value, id) composite
- Authorization filters are applied server-side — client cannot override
- Standard query parameters: cursor, limit, sort
- Standard response envelope: { data, cursor, meta }

Usage example:
    @router.get("/reports", response_model=PageResponse[ReportDTO])
    async def list_reports(
        pagination: PaginationParams = Depends(),
        db: AsyncSession = Depends(get_db),
    ) -> PageResponse[ReportDTO]:
        results, next_cursor = await report_repo.list_paginated(
            cursor=pagination.cursor,
            limit=pagination.limit,
        )
        return PageResponse.build(data=results, next_cursor=next_cursor)
"""

from __future__ import annotations

import base64
import json
from typing import Any, Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel, Field, model_validator

T = TypeVar("T")


# ──────────────────────────────────────────────────────────────
# Cursor encoding / decoding
# ──────────────────────────────────────────────────────────────

def encode_cursor(sort_value: Any, row_id: str) -> str:
    """
    Encode a stable pagination cursor from the sort field value and row ID.

    The cursor is a base64-encoded JSON string containing both values.
    This ensures stable, offset-free pagination even when data is inserted
    between pages.

    Args:
        sort_value: Value of the sort field (e.g., datetime, string)
        row_id:     UUID string of the row — used as tiebreaker

    Returns:
        Opaque base64 string safe to pass as a query parameter.
    """
    payload = json.dumps({"v": str(sort_value), "id": row_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode()).decode()


def decode_cursor(cursor: str) -> tuple[str, str] | None:
    """
    Decode a pagination cursor into (sort_value, row_id).

    Returns None if the cursor is invalid or malformed.
    Callers should treat None as "start from beginning".
    """
    try:
        payload = base64.urlsafe_b64decode(cursor.encode()).decode()
        data = json.loads(payload)
        return str(data["v"]), str(data["id"])
    except (KeyError, ValueError, Exception):
        return None


# ──────────────────────────────────────────────────────────────
# Request: pagination query parameters
# ──────────────────────────────────────────────────────────────

class PaginationParams(BaseModel):
    """
    Standard pagination query parameters.

    Inject via FastAPI Depends():
        async def endpoint(pagination: PaginationParams = Depends())
    """

    cursor: str | None = Query(
        default=None,
        description="Opaque pagination cursor from a previous response. "
        "Omit to start from the beginning.",
    )
    limit: int = Query(
        default=50,
        ge=1,
        le=200,
        description="Number of results per page. Maximum: 200.",
    )
    sort: str = Query(
        default="created_at:desc",
        description="Sort field and direction, e.g. 'created_at:desc' or 'severity:desc,created_at:desc'.",
        pattern=r"^[a-z_]+(:(asc|desc))?(,[a-z_]+(:(asc|desc))?)*$",
    )

    @model_validator(mode="after")
    def decode_and_validate_cursor(self) -> "PaginationParams":
        """Validate that cursor is decodable if provided."""
        if self.cursor is not None:
            decoded = decode_cursor(self.cursor)
            if decoded is None:
                # Invalid cursor: treat as start-of-list (don't error — client may have stale cursor)
                self.cursor = None
        return self

    def parsed_sort(self) -> list[tuple[str, str]]:
        """
        Return sort spec as list of (field, direction) tuples.

        Example: "created_at:desc,id:asc" → [("created_at", "desc"), ("id", "asc")]
        """
        parts = []
        for segment in self.sort.split(","):
            if ":" in segment:
                field, direction = segment.split(":", 1)
            else:
                field, direction = segment, "desc"
            parts.append((field.strip(), direction.strip()))
        return parts


# ──────────────────────────────────────────────────────────────
# Response: standard page envelope
# ──────────────────────────────────────────────────────────────

class CursorInfo(BaseModel):
    """Cursor navigation metadata in a page response."""
    next: str | None = Field(None, description="Cursor for the next page. Null if no more results.")
    has_more: bool = Field(False, description="True if more results exist after this page.")


class PageMeta(BaseModel):
    """Metadata about the page result."""
    as_of: str = Field(description="ISO-8601 timestamp when this query was executed.")


class PageResponse(BaseModel, Generic[T]):
    """
    Standard paginated response envelope for all list endpoints.

    Generic over the item type T. Example:
        PageResponse[ReportDTO]
    """
    data: list[T] = Field(description="List of items in this page.")
    cursor: CursorInfo = Field(description="Cursor navigation info.")
    meta: PageMeta = Field(description="Query execution metadata.")

    @classmethod
    def build(
        cls,
        *,
        data: list[T],
        next_cursor: str | None,
        as_of: str | None = None,
    ) -> "PageResponse[T]":
        """
        Build a PageResponse from result data and a pre-computed next cursor.

        Args:
            data:         The items for this page.
            next_cursor:  Encoded cursor for the next page, or None if last page.
            as_of:        Query execution timestamp (ISO-8601). Defaults to now.
        """
        from datetime import UTC, datetime

        return cls(
            data=data,
            cursor=CursorInfo(
                next=next_cursor,
                has_more=next_cursor is not None,
            ),
            meta=PageMeta(
                as_of=as_of or datetime.now(UTC).isoformat(),
            ),
        )

    @classmethod
    def empty(cls) -> "PageResponse[T]":
        """Return an empty page response."""
        from datetime import UTC, datetime

        return cls(
            data=[],
            cursor=CursorInfo(next=None, has_more=False),
            meta=PageMeta(as_of=datetime.now(UTC).isoformat()),
        )
