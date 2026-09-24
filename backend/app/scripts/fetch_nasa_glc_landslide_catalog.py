"""
app/scripts/fetch_nasa_glc_landslide_catalog.py — Real Landslide Catalog Sourcing.

Downloads NASA's public Global Landslide Catalog (GLC), filters it to the
North-Eastern Region bounding box, and writes a CSV in exactly the format
load_landslide_catalog.py expects — so the two scripts compose into a real
end-to-end sourcing pipeline:

    python -m app.scripts.fetch_nasa_glc_landslide_catalog \
        --out data/landslide_catalog/ner_landslide_events_nasa_glc.csv
    python -m app.scripts.load_landslide_catalog \
        --csv-path data/landslide_catalog/ner_landslide_events_nasa_glc.csv

IMPORTANT — what this is and is not:
  - This is REAL data (not synthetic): 320+ actual reported landslide events
    in the NER bounding box, 2007-2016, ~95% rainfall-triggered (downpour/
    rain/continuous_rain/monsoon) — a genuine, usable supervised-learning
    signal for Module 2.
  - This is NOT the official GSI Bhusanket inventory. GSI's Bhusanket portal
    (https://bhusanket.gsi.gov.in) and Bhukosh/NGDR repository do not expose
    a public bulk CSV/shapefile download as of this writing (confirmed by
    inspecting projectMetadata.html) — obtaining GSI's own inventory requires
    directly contacting GSI's Landslide Studies Division
    (dir.ghrm.landslide@gsi.gov.in) as a data request, which is a manual,
    human step this script cannot perform.
  - Source: NASA Goddard Space Flight Center, https://data.nasa.gov/dataset/global-landslide-catalog-export
    (public data.gov / NASA Open Data Portal listing, no login required for
    the raw CSV export used here). Please cite per NASA's request when this
    data (or any model trained on it) is published:
      Kirschbaum, D.B., Adler, R., Hong, Y., Hill, S., & Lerner-Lam, A. (2010).
      "A global landslide catalog for hazard applications: method, results,
      and limitations." Natural Hazards, 52(3), 561-575.
      Kirschbaum, D.B., Stanley, T., & Zhou, Y. (2015). "Spatial and Temporal
      Analysis of a Global Landslide Catalog." Geomorphology.
  - Use this catalog as a starting point / supplement, and swap in or merge
    with the real GSI catalog once your team obtains it from GSI directly.
"""

from __future__ import annotations

import argparse
import csv
import io
from datetime import datetime
from pathlib import Path
from urllib.request import urlopen

GLC_CSV_URL = (
    "https://data.nasa.gov/docs/legacy/Global_Landslide_Catalog_Export/"
    "Global_Landslide_Catalog_Export_rows.csv"
)

# North-Eastern Region bounding box — matches NER_BBOX in
# compute_terrain_features.py and NER_MIN/MAX_LON/LAT in reporting/domain/entities.py.
NER_MIN_LON, NER_MIN_LAT, NER_MAX_LON, NER_MAX_LAT = 89.5, 21.5, 97.5, 29.5

# NASA's landslide_size categories mapped onto this project's severity labels.
# Indicative mapping, not a calibrated scale — revisit once real GSI severity
# classifications are available.
SIZE_TO_SEVERITY = {
    "small": "LOW",
    "medium": "MEDIUM",
    "large": "HIGH",
    "very_large": "CRITICAL",
}


def _parse_event_date(raw: str) -> str | None:
    """Parse GLC's 'MM/DD/YYYY HH:MM:SS AM/PM' timestamp to ISO 8601 UTC."""
    if not raw:
        return None
    try:
        dt = datetime.strptime(raw.strip(), "%m/%d/%Y %I:%M:%S %p")
    except ValueError:
        return None
    return dt.isoformat() + "+00:00"


def filter_and_transform_rows(
    rows: list[dict[str, str]],
    min_lon: float = NER_MIN_LON,
    min_lat: float = NER_MIN_LAT,
    max_lon: float = NER_MAX_LON,
    max_lat: float = NER_MAX_LAT,
    country_name: str = "India",
) -> list[dict[str, str]]:
    """
    Pure transform: filter raw GLC CSV rows to the given bbox/country and
    reshape them into load_landslide_catalog.py's expected column format.
    No network I/O — this is the part unit tests exercise directly.
    """
    filtered: list[dict[str, str]] = []
    for row in rows:
        if country_name and row.get("country_name", "").strip().lower() != country_name.lower():
            continue
        try:
            lon = float(row["longitude"])
            lat = float(row["latitude"])
        except (KeyError, ValueError):
            continue
        if not (min_lon <= lon <= max_lon and min_lat <= lat <= max_lat):
            continue

        occurred_at = _parse_event_date(row.get("event_date", ""))
        if occurred_at is None:
            continue

        filtered.append(
            {
                "longitude": f"{lon:.6f}",
                "latitude": f"{lat:.6f}",
                "occurred_at": occurred_at,
                "source": "NASA_GLC",
                "severity": SIZE_TO_SEVERITY.get(row.get("landslide_size", ""), ""),
            }
        )

    return filtered


def download_glc_rows() -> list[dict[str, str]]:
    """Download the raw GLC CSV from NASA and parse it into row dicts."""
    with urlopen(GLC_CSV_URL, timeout=60) as response:  # noqa: S310 — fixed, hardcoded NASA URL
        raw_bytes = response.read()
    text = raw_bytes.decode("utf-8", errors="replace")
    return list(csv.DictReader(io.StringIO(text)))


def fetch_and_filter(
    min_lon: float = NER_MIN_LON,
    min_lat: float = NER_MIN_LAT,
    max_lon: float = NER_MAX_LON,
    max_lat: float = NER_MAX_LAT,
    country_name: str = "India",
) -> list[dict[str, str]]:
    """Download the GLC CSV and filter to real events within the given bbox."""
    rows = download_glc_rows()
    return filter_and_transform_rows(rows, min_lon, min_lat, max_lon, max_lat, country_name)


def write_catalog_csv(rows: list[dict[str, str]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = ["longitude", "latitude", "occurred_at", "source", "severity"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    default_out = (
        Path(__file__).resolve().parent.parent.parent.parent
        / "data"
        / "landslide_catalog"
        / "ner_landslide_events_nasa_glc.csv"
    )
    parser.add_argument("--out", type=Path, default=default_out)
    args = parser.parse_args()

    rows = fetch_and_filter()
    write_catalog_csv(rows, args.out)
    print(f"Fetched {len(rows)} real NER-region landslide events from NASA GLC -> {args.out}")


if __name__ == "__main__":
    main()
