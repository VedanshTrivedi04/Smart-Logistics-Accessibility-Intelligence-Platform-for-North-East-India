"""
ml-training/scripts/extend_real_risk_dataset.py — extend real_risk_dataset.csv with the 126 COOLR events
added by fetch_coolr_reports.py (ner_landslide_events_merged.csv) plus fresh background points.

Only NEW rows are fetched (existing rows are reused), so Open-Meteo's free-tier limit is not exhausted.
Aborts cleanly after several consecutive API failures (rate limit) and keeps what was fetched so far.
Same caveat as build_real_risk_dataset.py: presence-background labels, not verified stable areas.

    python scripts/extend_real_risk_dataset.py [--extra-neg 150]
"""

from __future__ import annotations

import argparse
import random
from datetime import date
from pathlib import Path

import pandas as pd

from build_real_risk_dataset import CATALOG, OUT_DIR, elevation_grid, slope_curvature, weather

MERGED = CATALOG.parent / "ner_landslide_events_merged.csv"
DATA = OUT_DIR / "real_risk_dataset.csv"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--extra-neg", type=int, default=150)
    ap.add_argument("--max-consecutive-fail", type=int, default=4)
    args = ap.parse_args()

    base = pd.read_csv(DATA)
    ev = pd.read_csv(MERGED)
    ev["day"] = pd.to_datetime(ev["occurred_at"], utc=True).dt.date
    have = {(round(r.longitude, 4), round(r.latitude, 4), r.date) for r in base[base.landslide == 1].itertuples()}
    new_pos = ev[[(round(r.longitude, 4), round(r.latitude, 4), r.day.isoformat()) not in have for r in ev.itertuples()]]
    print(f"existing rows {len(base)} | events in merged {len(ev)} | new positives to fetch {len(new_pos)}")

    rng = random.Random(7)
    ev_pts = list(zip(ev.latitude, ev.longitude, ev["day"]))
    months, years = ev["day"].map(lambda d: d.month).tolist(), ev["day"].map(lambda d: d.year).tolist()
    lat0, lat1, lon0, lon1 = ev.latitude.min(), ev.latitude.max(), ev.longitude.min(), ev.longitude.max()

    def near_event(la: float, lo: float, dy: date) -> bool:
        return any(abs(la - a) < 0.045 and abs(lo - b) < 0.05 and abs((dy - c).days) <= 3 for a, b, c in ev_pts)

    samples = [(r.latitude, r.longitude, r.day, 1) for r in new_pos.itertuples()]
    while len(samples) < len(new_pos) + args.extra_neg:
        la, lo = rng.uniform(lat0, lat1), rng.uniform(lon0, lon1)
        dy = date(rng.choice(years), rng.choice(months), rng.randint(1, 28))
        if not near_event(la, lo, dy):
            samples.append((la, lo, dy, 0))

    rows, fails = [], 0
    for n, (la, lo, dy, y) in enumerate(samples):
        try:
            slope, elev, curv = slope_curvature(elevation_grid(la, lo), la)
            wx = weather(la, lo, dy)
            fails = 0
        except Exception as exc:  # noqa: BLE001
            fails += 1
            print("skip", n, str(exc)[:90], flush=True)
            if fails >= args.max_consecutive_fail:
                print("aborting: repeated API failures (rate limit?) - keeping fetched rows")
                break
            continue
        rows.append({"latitude": la, "longitude": lo, "date": dy.isoformat(), "year": dy.year, "slope_pct": slope,
                     "elevation_mean_m": elev, "curvature_index": curv, **wx, "landslide": y,
                     "provenance": "REAL_COOLR+OPEN_METEO" if y else "BACKGROUND+OPEN_METEO"})
        if n % 25 == 0:
            print(f"{n}/{len(samples)}", flush=True)
    out = pd.concat([base, pd.DataFrame(rows).dropna()], ignore_index=True)
    out.to_csv(OUT_DIR / "real_risk_dataset_v2.csv", index=False)
    print(f"wrote real_risk_dataset_v2.csv rows={len(out)} positives={int(out.landslide.sum())} negatives={int((out.landslide == 0).sum())}")


if __name__ == "__main__":
    main()
