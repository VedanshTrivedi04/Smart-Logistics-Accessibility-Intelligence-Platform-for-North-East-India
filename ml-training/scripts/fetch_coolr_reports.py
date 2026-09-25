"""
ml-training/scripts/fetch_coolr_reports.py — India/NER records from NASA COOLR (Reports points).

Endpoint (found from the NASA Landslide Viewer web-map config; the older /gis05/ paths 404):
  https://gis.earthdata.nasa.gov/portal/rest/services/Landslides/COOLR_Reports_Points/FeatureServer/0

Writes:
  data/landslide_catalog/ner_landslide_events_coolr_reports.csv   (all India records in the NER bbox)
  data/landslide_catalog/ner_landslide_events_merged.csv          (GLC + COOLR, de-duplicated; provenance kept)

De-duplication: a COOLR record is dropped if a catalogued event lies within ~2 km and +-2 days
(COOLR Reports already contain the GLC, so most overlap is expected).
COOLR_Events_Points has NO India rows (only Myanmar/Bangladesh auto-mapped inventories) — not used.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CAT_DIR = ROOT / "data" / "landslide_catalog"
URL = "https://gis.earthdata.nasa.gov/portal/rest/services/Landslides/COOLR_Reports_Points/FeatureServer/0/query"
NER = (89.5, 21.5, 97.5, 29.5)
FIELDS = "objectid,event_id,event_date,event_title,landslide_category,landslide_trigger,landslide_size,fatality_count,latitude,longitude,country_name,admin_division_name,location_accuracy,photo_link,source_name,source_link"
SIZE_TO_SEVERITY = {"small": "LOW", "medium": "MEDIUM", "large": "HIGH", "very_large": "CRITICAL"}


def fetch() -> pd.DataFrame:
    rows, offset = [], 0
    while True:
        q = urllib.parse.urlencode({
            "where": "country_name='India'", "geometry": ",".join(map(str, NER)), "geometryType": "esriGeometryEnvelope",
            "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": FIELDS, "outSR": 4326,
            "resultOffset": offset, "resultRecordCount": 1000, "orderByFields": "objectid", "f": "json"})
        with urllib.request.urlopen(f"{URL}?{q}", timeout=90) as r:
            d = json.loads(r.read())
        feats = d.get("features", [])
        rows += [{**f["attributes"], "lon": f["geometry"]["x"], "lat": f["geometry"]["y"]} for f in feats if f.get("geometry")]
        if len(feats) < 1000:
            break
        offset += 1000
    return pd.DataFrame(rows)


def main() -> None:
    df = fetch()
    df["occurred_at"] = pd.to_datetime(df["event_date"], unit="ms", utc=True, errors="coerce")
    df = df.dropna(subset=["occurred_at", "lon", "lat"])
    df["severity"] = df["landslide_size"].map(SIZE_TO_SEVERITY).fillna("MEDIUM")
    raw = df.drop(columns=["longitude", "latitude"], errors="ignore").rename(columns={"lon": "longitude", "lat": "latitude"})
    raw.to_csv(CAT_DIR / "ner_landslide_events_coolr_reports.csv", index=False)
    print(f"COOLR India reports in NER bbox: {len(raw)} | with photo_link: {raw.photo_link.fillna('').str.startswith('http').sum()}")
    print("years:", raw.occurred_at.dt.year.value_counts().sort_index().to_dict())
    print("triggers:", raw.landslide_trigger.value_counts().head(6).to_dict())

    glc = pd.read_csv(CAT_DIR / "ner_landslide_events_nasa_glc.csv")
    glc["t"] = pd.to_datetime(glc["occurred_at"], utc=True)
    keep = []
    for r in raw.itertuples():
        near = glc[(abs(glc.longitude - r.longitude) < 0.02) & (abs(glc.latitude - r.latitude) < 0.02)
                   & ((glc.t - r.occurred_at).abs() <= pd.Timedelta(days=2))]
        keep.append(near.empty)
    new = raw[keep]
    merged = pd.concat([
        glc.assign(provenance="NASA_GLC")[["longitude", "latitude", "occurred_at", "severity", "provenance"]],
        new.assign(provenance="COOLR_REPORTS", occurred_at=new.occurred_at.dt.strftime("%Y-%m-%dT%H:%M:%S+00:00"))
           [["longitude", "latitude", "occurred_at", "severity", "provenance"]],
    ], ignore_index=True)
    merged.to_csv(CAT_DIR / "ner_landslide_events_merged.csv", index=False)
    print(f"GLC {len(glc)} + new unique COOLR {len(new)} = merged {len(merged)}")
    print("merged by year>=2000:", int((pd.to_datetime(merged.occurred_at, utc=True).dt.year >= 2000).sum()))


if __name__ == "__main__":
    main()
