"""
ml-training/scripts/generate_eta_ne_dataset.py — NE-realistic SYNTHETIC ETA training data.

Reads the cached real NE corridors (fetch_eta_ne_routes.py), calibrates the physics model on the four published
anchor travel times, then simulates many trips (both directions, real sampled rainfall, four vehicle classes)
and cuts each trip into variable-length segments - the unit the backend ETA model works on (per edge).

Output: data/eta_ne/ne_eta_dataset.csv  (+ eta_ne_calibration.json with parameters, anchor fit and provenance).
Provenance label on every row: SYNTHETIC_NE_CALIBRATED. Feature definitions match the backend
(`ETA_FEATURE_COLUMNS`): tortuosity = path length / straight-line distance between the segment's endpoints,
elevation_gain_m = summed ascent, vehicle_weight_kg = gross vehicle weight.

    python scripts/generate_eta_ne_dataset.py [--seed 7]
"""

from __future__ import annotations

import argparse
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from eta_physics import VEHICLE_CLASSES, calibrate, piece_times_s, sample_vehicle

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "eta_ne"
ANCHORS = ROOT / "anchors" / "eta_ne_anchors.json"
PROVENANCE = "SYNTHETIC_NE_CALIBRATED"
TRIP_FACTOR_SIGMA = 0.08  # shared by a whole trip (traffic, driver) - the model cannot know it
SEGMENT_NOISE_SIGMA = 0.06
RAIN_JITTER = (0.6, 1.4)
MIN_SEGMENT_KM = 0.2
MAX_TORTUOSITY = 8.0


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return float(2 * 6371000.0 * np.arcsin(np.sqrt(a)))


def orient(c: dict, reverse: bool) -> dict:
    if not reverse:
        return c
    r = dict(c)
    r["piece_len_m"] = c["piece_len_m"][::-1].copy()
    r["z_m"] = c["z_m"][::-1].copy()
    r["curv_deg_km"] = c["curv_deg_km"][::-1].copy()
    r["v_osrm_ms"] = c["v_osrm_ms"][::-1].copy()
    r["lat"], r["lon"] = c["lat"][::-1].copy(), c["lon"][::-1].copy()
    return r


def cut_points(rng: np.random.Generator, n_pieces: int, piece_len: np.ndarray) -> list[int]:
    """Random piece indices where the trip is cut into segments (median ~4 km, 0.5-60 km)."""
    cum = np.concatenate([[0.0], np.cumsum(piece_len)])
    cuts, pos = [0], 0.0
    while pos < cum[-1]:
        pos += float(np.clip(rng.lognormal(np.log(4000.0), 1.0), 500.0, 60000.0))
        cuts.append(int(min(np.searchsorted(cum, pos), n_pieces)))
    cuts[-1] = n_pieces
    return sorted(set(cuts))


def simulate(corridors: list[dict], params, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    classes = list(VEHICLE_CLASSES)
    weights = np.array([VEHICLE_CLASSES[c]["weight"] for c in classes])
    rows = []
    trip_id = 0
    for c0 in corridors:
        for reverse in (False, True):
            c = orient(c0, reverse)
            piece_len, z, curv, v_osrm = c["piece_len_m"], c["z_m"], c["curv_deg_km"], c["v_osrm_ms"]
            dz = np.diff(z)
            n = len(piece_len)
            for sample in c0["rain"]:
                for _ in range(2):  # two vehicles per (direction, weather sample)
                    cls = str(rng.choice(classes, p=weights / weights.sum()))
                    veh = sample_vehicle(rng, cls)
                    cuts = cut_points(rng, n, piece_len)
                    seg_rain = np.clip(sample["rain_mm_hr"] * rng.uniform(*RAIN_JITTER, size=len(cuts) - 1), 0.0, 120.0)
                    trip_factor = float(rng.lognormal(0.0, TRIP_FACTOR_SIGMA))
                    # per-piece rain = the rain of the segment the piece belongs to
                    rain_piece = np.zeros(n)
                    for k in range(len(cuts) - 1):
                        rain_piece[cuts[k]:cuts[k + 1]] = seg_rain[k]
                    t_piece = piece_times_s(piece_len, dz, curv, v_osrm, veh, rain_piece, params)
                    for k in range(len(cuts) - 1):
                        a, b = cuts[k], cuts[k + 1]
                        if b <= a:
                            continue
                        length_m = float(piece_len[a:b].sum())
                        straight = haversine_m(c["lat"][a], c["lon"][a], c["lat"][b], c["lon"][b])
                        rows.append({
                            "corridor": c0["name"], "direction": "rev" if reverse else "fwd", "trip_id": trip_id,
                            "vehicle_class": cls,
                            "length_km": length_m / 1000.0,
                            "elevation_gain_m": float(np.clip(dz[a:b], 0.0, None).sum()),
                            "tortuosity_index": max(1.0, length_m / max(straight, 1.0)),
                            "rainfall_rate_mmhr": float(seg_rain[k]),
                            "vehicle_weight_kg": veh["gvw"],
                            "duration_seconds": float(t_piece[a:b].sum() * trip_factor * rng.lognormal(0.0, SEGMENT_NOISE_SIGMA)),
                            "curv_deg_km_hidden": float(curv[a:b].mean()),
                            "provenance": PROVENANCE,
                        })
                    trip_id += 1
    df = pd.DataFrame(rows)
    # drop degenerate rows: sliver segments left over by the random cuts, and closed-loop segments whose
    # endpoint-based tortuosity is meaningless (>8; a real edge that loops would need special handling).
    return df[(df.length_km >= MIN_SEGMENT_KM) & (df.tortuosity_index <= MAX_TORTUOSITY)].reset_index(drop=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    corridors = pickle.load(open(DATA / "routes.pkl", "rb"))
    anchors = {k: v for k, v in json.load(open(ANCHORS)).items() if not k.startswith("_")}
    params, fit = calibrate(corridors, anchors)
    print(f"calibrated on {len(fit)} anchors: q={params.q:.2f}, c_ref={params.c_ref:.0f} deg/km")
    for r in fit:
        print(f"  {r['corridor']:18s} {r['km']:6.1f} km | target {r['target_hours']:.2f} h | model {r['predicted_hours']:.2f} h "
              f"| published range {r['range_hours']} | OSRM {r['osrm_hours']:.2f} h | within range: {r['within_published_range']}")
    df = simulate(corridors, params, args.seed)
    DATA.mkdir(parents=True, exist_ok=True)
    df.to_csv(DATA / "ne_eta_dataset.csv", index=False)
    (DATA / "eta_ne_calibration.json").write_text(json.dumps({
        "provenance": PROVENANCE, "params": params.as_dict(), "anchor_fit": fit, "rows": len(df), "trips": int(df.trip_id.nunique()),
        "corridors": len(corridors), "trip_factor_sigma": TRIP_FACTOR_SIGMA, "segment_noise_sigma": SEGMENT_NOISE_SIGMA,
        "assumptions": "vehicle power/weight, rolling resistance, curvature and rain speed effects are assumptions; only q and c_ref are fitted",
    }, indent=2), encoding="utf-8")
    print(f"wrote {len(df)} segment rows from {df.trip_id.nunique()} trips on {len(corridors)} corridors")
    print(df[["length_km", "elevation_gain_m", "tortuosity_index", "rainfall_rate_mmhr", "vehicle_weight_kg", "duration_seconds"]].describe().round(2).T.to_string())
    print("mean speed km/h by class:", (df.assign(v=df.length_km / (df.duration_seconds / 3600)).groupby("vehicle_class").v.mean().round(1)).to_dict())


if __name__ == "__main__":
    main()
