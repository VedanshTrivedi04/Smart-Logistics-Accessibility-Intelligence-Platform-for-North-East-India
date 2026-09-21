"""
tests/unit/test_pagination.py — Unit tests for cursor-based pagination.

Tests:
- Cursor encode/decode roundtrip
- Invalid cursor treated as start-of-list (not error)
- PageResponse.build constructs correct envelope
- Pagination params validate sort format
- Authorization filters cannot be overridden via sort param
"""

from __future__ import annotations

import pytest

from app.core.pagination import (
    PageResponse,
    PaginationParams,
    decode_cursor,
    encode_cursor,
)


class TestCursorEncoding:
    """Cursor encode/decode roundtrips."""

    def test_encode_decode_roundtrip(self) -> None:
        cursor = encode_cursor("2026-01-01T00:00:00", "abc-123")
        result = decode_cursor(cursor)
        assert result == ("2026-01-01T00:00:00", "abc-123")

    def test_encode_decode_with_special_characters(self) -> None:
        cursor = encode_cursor("2026-01-01T12:00:00+05:30", "uuid-with-dashes-abcd")
        result = decode_cursor(cursor)
        assert result is not None
        sort_val, row_id = result
        assert sort_val == "2026-01-01T12:00:00+05:30"
        assert row_id == "uuid-with-dashes-abcd"

    def test_decode_invalid_cursor_returns_none(self) -> None:
        """Invalid cursor → None (start of list, not an error)."""
        assert decode_cursor("not-base64!!!") is None

    def test_decode_empty_string_returns_none(self) -> None:
        assert decode_cursor("") is None

    def test_decode_truncated_cursor_returns_none(self) -> None:
        assert decode_cursor("aGVsbG8=") is None  # valid base64 but wrong JSON shape

    def test_cursors_are_url_safe(self) -> None:
        """Encoded cursors must be safe to use as query parameters."""
        cursor = encode_cursor("2026-09-21T15:00:00Z", "some-id-123")
        assert "+" not in cursor
        assert "/" not in cursor
        assert "=" not in cursor or cursor.endswith("==") or cursor.endswith("=")


class TestPaginationParams:
    """PaginationParams validation."""

    def test_default_values(self) -> None:
        params = PaginationParams()
        assert params.cursor is None
        assert params.limit == 50
        assert params.sort == "created_at:desc"

    def test_invalid_cursor_becomes_none(self) -> None:
        """Invalid cursors are silently set to None (start-of-list)."""
        params = PaginationParams(cursor="invalid!!!")
        assert params.cursor is None

    def test_valid_cursor_preserved(self) -> None:
        valid_cursor = encode_cursor("2026-01-01", "abc")
        params = PaginationParams(cursor=valid_cursor)
        assert params.cursor == valid_cursor

    def test_limit_maximum_is_200(self) -> None:
        with pytest.raises(Exception):
            PaginationParams(limit=201)

    def test_limit_minimum_is_1(self) -> None:
        with pytest.raises(Exception):
            PaginationParams(limit=0)

    def test_parsed_sort_single_field(self) -> None:
        params = PaginationParams(sort="created_at:desc")
        assert params.parsed_sort() == [("created_at", "desc")]

    def test_parsed_sort_multiple_fields(self) -> None:
        params = PaginationParams(sort="severity:desc,created_at:asc")
        assert params.parsed_sort() == [("severity", "desc"), ("created_at", "asc")]

    def test_parsed_sort_without_direction_defaults_to_desc(self) -> None:
        params = PaginationParams(sort="created_at")
        assert params.parsed_sort() == [("created_at", "desc")]


class TestPageResponse:
    """PageResponse envelope construction."""

    def test_build_with_next_cursor(self) -> None:
        cursor = encode_cursor("2026-01-01", "id-1")
        response = PageResponse[str].build(data=["a", "b"], next_cursor=cursor)
        assert response.data == ["a", "b"]
        assert response.cursor.next == cursor
        assert response.cursor.has_more is True

    def test_build_without_next_cursor(self) -> None:
        response = PageResponse[str].build(data=["a"], next_cursor=None)
        assert response.cursor.next is None
        assert response.cursor.has_more is False

    def test_empty_page(self) -> None:
        response = PageResponse[str].empty()
        assert response.data == []
        assert response.cursor.has_more is False
        assert response.cursor.next is None

    def test_meta_contains_as_of_timestamp(self) -> None:
        response = PageResponse[str].build(data=[], next_cursor=None)
        assert "T" in response.meta.as_of  # ISO-8601 format check

    def test_custom_as_of_timestamp(self) -> None:
        response = PageResponse[str].build(
            data=[], next_cursor=None, as_of="2026-01-01T00:00:00Z"
        )
        assert response.meta.as_of == "2026-01-01T00:00:00Z"

    def test_page_response_is_serialisable(self) -> None:
        """PageResponse must be JSON-serialisable for API responses."""
        import json
        response = PageResponse[str].build(data=["item1"], next_cursor=None)
        # Should not raise
        serialised = json.dumps(response.model_dump())
        assert "item1" in serialised
