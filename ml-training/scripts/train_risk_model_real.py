"""
ml-training/scripts/train_risk_model_real.py — risk model on REAL data.

Data: real_risk_dataset.csv from build_real_risk_dataset.py (NASA GLC events +
open-data features; presence-background labels — see that script's CAVEAT).

Evaluation (no random splits on spatio-temporal data):
  1. Temporal holdout  : train on earlier years, test on the latest ~25% of event years.
  2. Spatial block CV  : GroupKFold over 0.5-degree cells (model never sees the test area).
  3. Baselines         : rainfall-only model and prevalence, to show terrain adds signal.
Saves risk_model_xgboost_real.pkl (+ metrics json). Metrics are NOT SIH-target
accuracy claims: background points are unverified, so PR-AUC is prevalence-relative.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "real" / os.environ.get("RISK_DATA", "real_risk_dataset.csv")
FEATURES = ["slope_pct", "elevation_mean_m", "curvature_index", "rainfall_72h_mm", "ari_score", "soil_moisture_index"]
RAIN_ONLY = ["rainfall_72h_mm", "ari_score", "soil_moisture_index"]


def make_model() -> xgb.XGBClassifier:
    return xgb.XGBClassifier(n_estimators=250, max_depth=3, learning_rate=0.05, subsample=0.8,
                             colsample_bytree=0.8, min_child_weight=3, reg_lambda=2.0,
                             eval_metric="aucpr", random_state=42)


def score(y, p) -> dict[str, float]:
    return {"pr_auc": float(average_precision_score(y, p)), "roc_auc": float(roc_auc_score(y, p)),
            "brier": float(brier_score_loss(y, p)), "prevalence": float(np.mean(y))}


def main() -> None:
    df = pd.read_csv(DATA)
    print(f"rows={len(df)} positives={int(df.landslide.sum())} years={df.year.min()}-{df.year.max()}")
    y = df["landslide"]

    cut = int(df.loc[y == 1, "year"].quantile(0.75))
    train, test = df[df.year <= cut], df[df.year > cut]
    m = make_model().fit(train[FEATURES], train.landslide)
    temporal = score(test.landslide, m.predict_proba(test[FEATURES])[:, 1])
    base = make_model().fit(train[RAIN_ONLY], train.landslide)
    temporal_rain_only = score(test.landslide, base.predict_proba(test[RAIN_ONLY])[:, 1])
    print(f"[temporal holdout year>{cut}] train={len(train)} test={len(test)}")
    print("  full      ", {k: round(v, 3) for k, v in temporal.items()})
    print("  rain-only ", {k: round(v, 3) for k, v in temporal_rain_only.items()})

    cells = (df.longitude // 0.5).astype(int).astype(str) + "_" + (df.latitude // 0.5).astype(int).astype(str)
    oof = np.zeros(len(df))
    for tr, te in GroupKFold(n_splits=5).split(df, y, groups=cells):
        oof[te] = make_model().fit(df.iloc[tr][FEATURES], y.iloc[tr]).predict_proba(df.iloc[te][FEATURES])[:, 1]
    spatial = score(y, oof)
    print("[spatial block 5-fold CV]", {k: round(v, 3) for k, v in spatial.items()})

    final = make_model().fit(df[FEATURES], y)
    imp = sorted(zip(FEATURES, final.feature_importances_.tolist()), key=lambda t: -t[1])
    print("importance:", [(n, round(v, 3)) for n, v in imp])

    out = ROOT / "models"
    out.mkdir(exist_ok=True)
    joblib.dump(final, out / "risk_model_xgboost_real.pkl")
    (out / "risk_model_real_metrics.json").write_text(json.dumps({
        "provenance": "REAL_NASA_GLC+OPEN_METEO (presence-background)", "rows": len(df),
        "temporal_holdout": temporal, "temporal_rain_only_baseline": temporal_rain_only,
        "spatial_block_cv": spatial, "feature_importance": imp}, indent=2), encoding="utf-8")
    print("saved", out / "risk_model_xgboost_real.pkl")


if __name__ == "__main__":
    main()
