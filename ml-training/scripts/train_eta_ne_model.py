"""
ml-training/scripts/train_eta_ne_model.py — CatBoost ETA model on the NE-calibrated SYNTHETIC dataset.

Same 5 backend features and monotonic constraints as the original ETA model (higher gain, tortuosity, rain,
weight and length can never DECREASE the predicted duration). Rows are weighted by 1/sqrt(duration): the
backend SUMS per-edge predictions, so route totals must be unbiased; 1/duration^2 weighting was tried and biased
route totals by -15 %, while this weighting gave ~0 % (loss comparison in memory/portals/shared/backend-ai.md).

Validation is leave-corridor-out (GroupKFold on `corridor`): a corridor's geometry never appears in both train
and test. Reported: segment-level MAPE and ROUTE-level (sum over a trip's segments) MAPE, bias and relative
spread - the last one feeds the backend's confidence band. IMPORTANT: these numbers measure how well the model
reproduces the synthetic generator on unseen corridors; they are NOT accuracy against real trips.

    python scripts/train_eta_ne_model.py [--data data/eta_ne/ne_eta_dataset.csv]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor, Pool
from sklearn.model_selection import GroupKFold

ROOT = Path(__file__).resolve().parents[1]
FEATURES = ["length_km", "elevation_gain_m", "tortuosity_index", "rainfall_rate_mmhr", "vehicle_weight_kg"]
TARGET = "duration_seconds"
MONOTONIC = [1, 1, 1, 1, 1]
PARAMS = dict(iterations=700, depth=6, learning_rate=0.05, loss_function="RMSE", l2_leaf_reg=3.0, random_seed=42, verbose=False)


def fit(x: pd.DataFrame, y: pd.Series) -> CatBoostRegressor:
    m = CatBoostRegressor(monotone_constraints=MONOTONIC, **PARAMS)
    m.fit(Pool(x, y, weight=1.0 / np.sqrt(y.to_numpy())))
    return m


def mape(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean(np.abs((y - p) / y)) * 100.0)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=ROOT / "data" / "eta_ne" / "ne_eta_dataset.csv")
    ap.add_argument("--out-tag", default="ne")
    args = ap.parse_args()
    df = pd.read_csv(args.data)
    x, y, groups = df[FEATURES], df[TARGET], df["corridor"]
    print(f"rows={len(df)} trips={df.trip_id.nunique()} corridors={groups.nunique()}")

    oof = np.zeros(len(df))
    for fold, (tr, te) in enumerate(GroupKFold(n_splits=5).split(x, y, groups)):
        m = fit(x.iloc[tr], y.iloc[tr])
        oof[te] = m.predict(x.iloc[te])
        print(f"  fold {fold}: held-out corridors {sorted(groups.iloc[te].unique())[:3]}... segment MAPE {mape(y.iloc[te].to_numpy(), oof[te]):.1f}%")

    seg_mape = mape(y.to_numpy(), oof)
    trips = df.assign(pred=oof).groupby("trip_id").agg(true=(TARGET, "sum"), pred=("pred", "sum"), vehicle_class=("vehicle_class", "first"))
    rel = trips.pred / trips.true - 1.0
    route_mape, route_bias, route_rel_std = float(rel.abs().mean() * 100.0), float(rel.mean() * 100.0), float(rel.std())
    resid_std = float(np.std(y.to_numpy() - oof))
    print(f"segment MAPE (leave-corridor-out): {seg_mape:.2f}%")
    print(f"route MAPE: {route_mape:.2f}% | route bias: {route_bias:+.2f}% | route relative std: {route_rel_std:.3f}")
    by_class = {c: round(float(rel[trips.vehicle_class == c].abs().mean() * 100.0), 2) for c in sorted(trips.vehicle_class.unique())}
    print("route MAPE by vehicle class:", by_class)

    final = fit(x, y)
    models = ROOT / "models"
    models.mkdir(exist_ok=True)
    final.save_model(str(models / f"eta_model_catboost_{args.out_tag}.cbm"))
    ranges = {c: [float(df[c].min()), float(df[c].max())] for c in FEATURES}
    metrics = {
        "provenance": "SYNTHETIC_NE_CALIBRATED",
        "note": "Trained on NE-calibrated SYNTHETIC data (real OSM road geometry + SRTM terrain + real sampled rainfall, physics labels calibrated on 4 published anchor times). Metrics compare against the synthetic generator on unseen corridors, NOT real trips.",
        "mape_pct": seg_mape, "segment_mape_pct_leave_corridor_out": seg_mape,
        "route_mape_pct": route_mape, "route_bias_pct": route_bias, "route_relative_std": route_rel_std,
        "route_mape_by_vehicle_class": by_class, "residual_std_seconds": resid_std,
        "train_rows": len(df), "test_rows": len(df), "trips": int(df.trip_id.nunique()), "corridors": int(groups.nunique()),
        "feature_ranges": ranges, "monotonic_constraints": dict(zip(FEATURES, MONOTONIC)),
    }
    (models / f"eta_model_{args.out_tag}_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print("saved", models / f"eta_model_catboost_{args.out_tag}.cbm")


if __name__ == "__main__":
    main()
