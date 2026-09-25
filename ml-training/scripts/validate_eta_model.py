"""
ml-training/scripts/validate_eta_model.py — independent validation of the NE-calibrated ETA model.

1. ANCHORS (held out): a model trained WITHOUT the 4 anchor corridors predicts them for a reference car on
   ~5 km segments; compared with the published typical times, OSRM's own duration and the old synthetic model.
2. MONOTONICITY: grid sweep - no feature increase may ever shorten the predicted time.
3. PHYSICAL SANITY: class ordering, rain effect, climb effect, length scaling.
4. COVERAGE: backend-style edge features stay inside the training ranges.
Writes models/eta_validation_report.json. Exit code 1 on any hard failure.

Anchor agreement is a plausibility check against approximate published times - it is not proof of real-world accuracy.
"""

from __future__ import annotations

import json
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor

from eta_physics import _target_s
from train_eta_ne_model import FEATURES, fit

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "eta_ne"
failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f" | {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def edge_features(c: dict, seg_km: float, weight_kg: float, rain: float) -> pd.DataFrame:
    """Cut a corridor into ~seg_km edges and compute the backend's 5 features for each."""
    from generate_eta_ne_dataset import haversine_m

    cum = np.concatenate([[0.0], np.cumsum(c["piece_len_m"])])
    n = len(c["piece_len_m"])
    cuts = sorted({min(int(np.searchsorted(cum, k * seg_km * 1000.0)), n) for k in range(int(cum[-1] / (seg_km * 1000.0)) + 2)} | {0, n})
    dz = np.diff(c["z_m"])
    rows = []
    for a, b in zip(cuts[:-1], cuts[1:]):
        if b <= a:
            continue
        length = float(c["piece_len_m"][a:b].sum())
        straight = haversine_m(c["lat"][a], c["lon"][a], c["lat"][b], c["lon"][b])
        rows.append({"length_km": length / 1000.0, "elevation_gain_m": float(np.clip(dz[a:b], 0, None).sum()),
                     "tortuosity_index": min(8.0, max(1.0, length / max(straight, 1.0))), "rainfall_rate_mmhr": rain, "vehicle_weight_kg": weight_kg})
    return pd.DataFrame(rows)


def main() -> None:
    corridors = pickle.load(open(DATA / "routes.pkl", "rb"))
    anchors = {k: v for k, v in json.load(open(ROOT / "anchors" / "eta_ne_anchors.json")).items() if not k.startswith("_")}
    df = pd.read_csv(DATA / "ne_eta_dataset.csv")
    report: dict = {}

    # 1. anchors with a model that never saw them
    train = df[~df.corridor.isin(anchors)]
    held_out_model = fit(train[FEATURES], train["duration_seconds"])
    old_model = CatBoostRegressor()
    old_model.load_model(str(ROOT / "models" / "eta_model_catboost.cbm"))
    print(f"\nANCHORS (model trained on {train.corridor.nunique()} corridors, anchors excluded); reference car, dry, 5 km edges")
    print(f"{'corridor':20s}{'km':>7s}{'target h':>10s}{'range h':>14s}{'NEW model':>11s}{'OSRM':>8s}{'OLD synth':>11s}")
    rows = []
    for c in corridors:
        if c["name"] not in anchors:
            continue
        a = anchors[c["name"]]
        km = c["piece_len_m"].sum() / 1000.0
        f = edge_features(c, 5.0, 1800.0, 0.0)
        new_h = float(held_out_model.predict(f[FEATURES]).sum() / 3600.0)
        old_h = float(old_model.predict(f[FEATURES]).sum() / 3600.0)
        target = _target_s(c, a) / 3600.0
        lo, hi = [x * km / a["km"] for x in a["range_hours"]]
        rows.append({"corridor": c["name"], "km": round(km, 1), "target_h": round(target, 2), "range_h": [round(lo, 2), round(hi, 2)],
                     "new_h": round(new_h, 2), "osrm_h": round(c["osrm_duration_s"] / 3600.0, 2), "old_synthetic_h": round(old_h, 2),
                     "new_err_pct": round((new_h / target - 1) * 100, 1), "osrm_err_pct": round((c["osrm_duration_s"] / 3600.0 / target - 1) * 100, 1),
                     "old_err_pct": round((old_h / target - 1) * 100, 1)})
        print(f"{c['name']:20s}{km:7.0f}{target:10.2f}{f'{lo:.2f}-{hi:.2f}':>14s}{new_h:11.2f}{c['osrm_duration_s'] / 3600:8.2f}{old_h:11.2f}")
    report["anchors_held_out"] = rows
    new_abs = np.mean([abs(r["new_err_pct"]) for r in rows]); osrm_abs = np.mean([abs(r["osrm_err_pct"]) for r in rows]); old_abs = np.mean([abs(r["old_err_pct"]) for r in rows])
    print(f"mean |error| vs published typical time: NEW {new_abs:.1f}% | OSRM {osrm_abs:.1f}% | OLD synthetic {old_abs:.1f}%")
    check("held-out anchors: new model mean |error| <= 25 % (published times are +-15-20 % themselves)", new_abs <= 25.0, f"{new_abs:.1f}%")
    check("new model beats raw OSRM on the anchors", new_abs < osrm_abs, f"{new_abs:.1f}% vs {osrm_abs:.1f}%")
    check("new model beats the old synthetic model on the anchors", new_abs < old_abs, f"{new_abs:.1f}% vs {old_abs:.1f}%")
    check("every held-out anchor within 35 % of the published typical time", all(abs(r["new_err_pct"]) <= 35 for r in rows))

    # final production model = the one saved by train_eta_ne_model.py
    model = CatBoostRegressor()
    model.load_model(str(ROOT / "models" / "eta_model_catboost_ne.cbm"))
    rng = np.random.default_rng(3)
    base = pd.DataFrame({"length_km": rng.uniform(0.5, 30, 400), "elevation_gain_m": rng.uniform(0, 600, 400), "tortuosity_index": rng.uniform(1.0, 3.0, 400),
                         "rainfall_rate_mmhr": rng.uniform(0, 30, 400), "vehicle_weight_kg": rng.uniform(1500, 25000, 400)})

    # 2. monotonicity
    print("\nMONOTONICITY (400 random base points x 12-step sweeps)")
    steps = {"length_km": (0.5, 40), "elevation_gain_m": (0, 1000), "tortuosity_index": (1.0, 4.0), "rainfall_rate_mmhr": (0, 60), "vehicle_weight_kg": (1500, 25000)}
    for feat, (lo, hi) in steps.items():
        viol = 0
        prev = None
        for v in np.linspace(lo, hi, 12):
            p = model.predict(base.assign(**{feat: v})[FEATURES])
            if prev is not None:
                viol += int((p < prev - 1e-6).sum())
            prev = p
        check(f"monotone non-decreasing in {feat}", viol == 0, f"{viol} violations")

    # 3. physical sanity (same edge, only one thing changed)
    print("\nPHYSICAL SANITY")
    edge = pd.DataFrame([{"length_km": 8.0, "elevation_gain_m": 250.0, "tortuosity_index": 1.4, "rainfall_rate_mmhr": 0.0, "vehicle_weight_kg": 12000.0}])
    t0 = float(model.predict(edge)[0])
    t_rain = float(model.predict(edge.assign(rainfall_rate_mmhr=20.0))[0])
    heavy = float(model.predict(edge.assign(vehicle_weight_kg=24000.0))[0])
    car = float(model.predict(edge.assign(vehicle_weight_kg=1800.0))[0])
    flat = float(model.predict(edge.assign(elevation_gain_m=0.0))[0])
    steep = float(model.predict(edge.assign(elevation_gain_m=800.0))[0])
    dbl = float(model.predict(edge.assign(length_km=16.0, elevation_gain_m=500.0))[0])
    print(f"  base 8 km medium truck: {t0 / 60:.1f} min | rain 20 mm/h: {t_rain / 60:.1f} | heavy 24 t: {heavy / 60:.1f} | car: {car / 60:.1f} | flat: {flat / 60:.1f} | +800 m gain: {steep / 60:.1f} | 16 km & 500 m gain: {dbl / 60:.1f}")
    check("heavy truck slower than car on the same edge", heavy > car)
    check("20 mm/h rain slows the trip by 5-40 %", 1.05 <= t_rain / t0 <= 1.40, f"+{(t_rain / t0 - 1) * 100:.1f}%")
    check("steep climb (+800 m) slower than flat", steep > flat * 1.1, f"x{steep / flat:.2f}")
    check("doubling length and gain roughly doubles time (1.6-2.6x)", 1.6 <= dbl / t0 <= 2.6, f"x{dbl / t0:.2f}")
    speed_kmh = 8.0 / (t0 / 3600.0)
    check("implied medium-truck hill speed is plausible (10-40 km/h)", 10 <= speed_kmh <= 40, f"{speed_kmh:.1f} km/h")

    # 4. coverage of backend-style inputs
    print("\nCOVERAGE")
    ranges = {c: (df[c].min(), df[c].max()) for c in FEATURES}
    backend_edge = {"length_km": 54.0, "elevation_gain_m": 0.0, "tortuosity_index": 1.08, "rainfall_rate_mmhr": 0.0, "vehicle_weight_kg": 16000.0}
    check("largest seeded backend edge (54 km, tortuosity 1.08, 16 t) lies inside training ranges", all(ranges[k][0] <= v <= ranges[k][1] for k, v in backend_edge.items()), str({k: (round(a, 1), round(b, 1)) for k, (a, b) in ranges.items()}))

    (ROOT / "models" / "eta_validation_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\n{'ALL CHECKS PASSED' if not failures else 'FAILED: ' + '; '.join(failures)}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
