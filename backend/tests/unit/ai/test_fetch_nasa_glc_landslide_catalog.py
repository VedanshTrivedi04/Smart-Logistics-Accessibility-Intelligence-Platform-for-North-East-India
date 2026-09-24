"""
tests/unit/ai/test_fetch_nasa_glc_landslide_catalog.py — Unit Tests for the real
NASA GLC landslide-catalog sourcing script's pure filter/transform logic.

No network access needed/used — download_glc_rows() (the one function that
hits the network) is deliberately untested here; these tests exercise
filter_and_transform_rows() and _parse_event_date() against hand-built rows
shaped like the real CSV's columns.
"""

from __future__ import annotations

from app.scripts.fetch_nasa_glc_landslide_catalog import (
    NER_MAX_LAT,
    NER_MAX_LON,
    NER_MIN_LAT,
    NER_MIN_LON,
    _parse_event_date,
    filter_and_transform_rows,
)


def make_glc_row(**overrides: str) -> dict[str, str]:
    defaults = {
        "country_name": "India",
        "longitude": "91.75",
        "latitude": "26.15",
        "event_date": "07/29/2010 11:00:00 PM",
        "landslide_size": "medium",
    }
    defaults.update(overrides)
    return defaults


class TestParseEventDate:
    def test_parses_valid_glc_timestamp(self) -> None:
        assert _parse_event_date("07/29/2010 11:00:00 PM") == "2010-07-29T23:00:00+00:00"

    def test_empty_string_returns_none(self) -> None:
        assert _parse_event_date("") is None

    def test_malformed_string_returns_none(self) -> None:
        assert _parse_event_date("not-a-date") is None


class TestFilterAndTransformRows:
    def test_keeps_rows_inside_ner_bbox(self) -> None:
        rows = [make_glc_row()]
        result = filter_and_transform_rows(rows)
        assert len(result) == 1
        assert result[0]["source"] == "NASA_GLC"
        assert result[0]["severity"] == "MEDIUM"

    def test_drops_rows_outside_ner_bbox(self) -> None:
        rows = [make_glc_row(longitude="77.20", latitude="28.60")]  # Delhi
        assert filter_and_transform_rows(rows) == []

    def test_drops_rows_from_other_countries(self) -> None:
        rows = [make_glc_row(country_name="China")]
        assert filter_and_transform_rows(rows) == []

    def test_drops_rows_with_missing_or_invalid_coordinates(self) -> None:
        rows = [make_glc_row(longitude=""), make_glc_row(latitude="not-a-number")]
        assert filter_and_transform_rows(rows) == []

    def test_drops_rows_with_unparseable_dates(self) -> None:
        rows = [make_glc_row(event_date="garbage")]
        assert filter_and_transform_rows(rows) == []

    def test_unknown_landslide_size_maps_to_empty_severity(self) -> None:
        rows = [make_glc_row(landslide_size="unknown")]
        result = filter_and_transform_rows(rows)
        assert result[0]["severity"] == ""

    def test_bbox_boundary_values_are_inclusive(self) -> None:
        rows = [make_glc_row(longitude=str(NER_MIN_LON), latitude=str(NER_MIN_LAT))]
        assert len(filter_and_transform_rows(rows)) == 1
        rows = [make_glc_row(longitude=str(NER_MAX_LON), latitude=str(NER_MAX_LAT))]
        assert len(filter_and_transform_rows(rows)) == 1

    def test_output_is_compatible_with_load_landslide_catalog_parser(self) -> None:
        """
        The output columns must exactly match what
        app.scripts.load_landslide_catalog._parse_landslide_catalog_csv expects
        (via csv.DictReader on the written file) — this is what makes the two
        scripts compose into a real pipeline.
        """
        rows = [make_glc_row()]
        result = filter_and_transform_rows(rows)
        expected_columns = {"longitude", "latitude", "occurred_at", "source", "severity"}
        assert set(result[0].keys()) == expected_columns
