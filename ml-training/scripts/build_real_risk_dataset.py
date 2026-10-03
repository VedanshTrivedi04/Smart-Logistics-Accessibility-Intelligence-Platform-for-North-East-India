"""
ml-training/scripts/build_real_risk_dataset.py — REAL (non-synthetic) risk dataset.

Positives : the 320 real NASA GLC landslide events in data/landslide_catalog/.
Background: random points/dates from the same bbox and monsoon season, kept
            >= 5 km and >= 3 days away from any catalogued event.
Features  : all from free open APIs (Open-Meteo archive + elevation), cached
            on disk so re-runs are cheap. No database is touched.

CAVEAT (presence-background data): a background point is "no *catalogued*
landslide", not "verified stable". Metrics are therefore optimistic/biased and
must never be quoted as final accuracy — they only show the model learns real
signal. Missing (not fakeable here): distance_to_stream_m, susceptibility zone.

    python scripts/build_real_risk_dataset.py
"""

from __future__ import annotations

import json
import math
import random
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "data" / "landslide_catalog" / "ner_landslide_events_nasa_glc.csv"
OUT_DIR = Path(__file__).resolve().parents[1] / "data" / "real"
CACHE_DIR = OUT_DIR / "cache"
import os
NEG_PER_POS = int(os.environ.get("NEG_PER_POS", "1"))  # 1:1 keeps us inside Open-Meteo free-tier limits
STEP_DEG = 0.001  # ~110 m, close to the 90 m DEM posting
SEED = 42


def _get_json(url: str, cache_key: str) -> dict:
    cache = CACHE_DIR / f"{cache_key}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    if os.environ.get("CACHE_ONLY"):  # use only already-fetched samples (API rate-limit escape hatch)
        raise RuntimeError("not cached")
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                data = json.loads(resp.read())
            cache.write_text(json.dumps(data))
            time.sleep(0.15)
            return data
        except Exception as exc:  # noqa: BLE001 — retry on any transient/429 error
            last = f"{type(exc).__name__}: {exc}"
            time.sleep(2 ** attempt)
    raise RuntimeError(f"failed after retries ({last}): {url[:90]}")


def elevation_grid(lat: float, lon: float) -> list[float]:
    """3x3 elevations (row-major, north→south, west→east)."""
    lats, lons = [], []
    for dy in (1, 0, -1):
        for dx in (-1, 0, 1):
            lats.append(round(lat + dy * STEP_DEG, 6))
            lons.append(round(lon + dx * STEP_DEG, 6))
    q = urllib.parse.urlencode({"latitude": ",".join(map(str, lats)), "longitude": ",".join(map(str, lons))})
    key = f"elev_{lat:.5f}_{lon:.5f}"
    return _get_json(f"https://api.open-meteo.com/v1/elevation?{q}", key)["elevation"]


def slope_curvature(z: list[float], lat: float) -> tuple[float, float, float]:
    """Horn slope (% rise), and a Laplacian curvature index, from the 3x3 grid."""
    dy_m = STEP_DEG * 111_320.0
    dx_m = STEP_DEG * 111_320.0 * math.cos(math.radians(lat))
    a, b, c, d, e, f, g, h, i = z
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * dx_m)
    dzdy = ((a + 2 * b + c) - (g + 2 * h + i)) / (8 * dy_m)
    slope_pct = math.hypot(dzdx, dzdy) * 100.0
    curvature = (b + h - 2 * e) / dy_m**2 + (d + f - 2 * e) / dx_m**2
    return slope_pct, e, curvature * 1e4


def weather(lat: float, lon: float, day: date) -> dict[str, float]:
    start, end = day - timedelta(days=7), day
    q = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon, "start_date": start.isoformat(), "end_date": end.isoformat(),
        "daily": "precipitation_sum", "hourly": "soil_moisture_0_to_7cm", "timezone": "UTC",
    })
    key = f"wx_{lat:.4f}_{lon:.4f}_{day.isoformat()}"
    d = _get_json(f"https://archive-api.open-meteo.com/v1/archive?{q}", key)
    rain = [r or 0.0 for r in d["daily"]["precipitation_sum"]]  # oldest → event day
    sm = [s for s in d["hourly"]["soil_moisture_0_to_7cm"][-24:] if s is not None]
    r72 = sum(rain[-3:])
    ari = sum((0.85 ** i) * rain[-1 - i] for i in range(1, 8))
    return {"rainfall_72h_mm": r72, "ari_score": ari, "soil_moisture_index": sum(sm) / len(sm) if sm else float("nan")}


def main() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ev = pd.read_csv(CATALOG)
    ev["day"] = pd.to_datetime(ev["occurred_at"], utc=True).dt.date
    ev = ev[(ev["day"] >= date(2000, 1, 1))].reset_index(drop=True)  # Open-Meteo archive era
    rng = random.Random(SEED)
    lon0, lon1 = ev.longitude.min(), ev.longitude.max()
    lat0, lat1 = ev.latitude.min(), ev.latitude.max()
    months = ev["day"].map(lambda d: d.month).tolist()
    years = ev["day"].map(lambda d: d.year).tolist()
    ev_pts = list(zip(ev.latitude, ev.longitude, ev["day"]))

    def near_event(la: float, lo: float, dy: date) -> bool:
        return any(abs(la - a) < 0.045 and abs(lo - b) < 0.05 and abs((dy - c).days) <= 3 for a, b, c in ev_pts)

    samples = [(r.latitude, r.longitude, r.day, 1) for r in ev.itertuples()]
    while len(samples) < len(ev) * (1 + NEG_PER_POS):
        la, lo = rng.uniform(lat0, lat1), rng.uniform(lon0, lon1)
        dy = date(rng.choice(years), rng.choice(months), rng.randint(1, 28))
        if not near_event(la, lo, dy):
            samples.append((la, lo, dy, 0))

    rows = []
    for n, (la, lo, dy, y) in enumerate(samples):
        try:
            slope, elev, curv = slope_curvature(elevation_grid(la, lo), la)
            wx = weather(la, lo, dy)
        except Exception as exc:  # noqa: BLE001
            print("skip", n, str(exc)[:200])
            continue
        rows.append({"latitude": la, "longitude": lo, "date": dy.isoformat(), "year": dy.year,
                     "slope_pct": slope, "elevation_mean_m": elev, "curvature_index": curv, **wx,
                     "landslide": y, "provenance": "REAL_NASA_GLC+OPEN_METEO"})
        if n % 100 == 0:
            print(f"{n}/{len(samples)}")
    df = pd.DataFrame(rows).dropna()
    out = OUT_DIR / "real_risk_dataset.csv"
    df.to_csv(out, index=False)
    print(f"wrote {out} rows={len(df)} positives={int(df.landslide.sum())}")


if __name__ == "__main__":
    main()
