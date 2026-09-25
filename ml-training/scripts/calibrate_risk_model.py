"""
ml-training/scripts/calibrate_risk_model.py — probability calibration for the real risk model.

Two steps (saved to risk_calibration.json, applied by the backend predictor):
  1. Platt scaling fitted on spatial-block OUT-OF-FOLD scores (model never saw those areas),
     fixing over/under-confidence of the raw XGBoost output *within the training distribution*.
  2. Prior-shift to an ASSUMED real-world prevalence. Training data is presence-background
     (~50% positives), so raw probabilities are inflated relative to reality. Real per-edge
     landslide prevalence is UNKNOWN until verified negatives / GSI data exist — the value is a
     configurable assumption, not a measurement.

    python scripts/calibrate_risk_model.py [--assumed-prevalence 0.05]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss
from sklearn.model_selection import GroupKFold

from train_risk_model_real import DATA, FEATURES, ROOT, make_model

EPS = 1e-6


def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, EPS, 1 - EPS)
    return np.log(p / (1 - p))


def ece(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges) - 1, 0, bins - 1)
    return float(sum(abs(y[idx == b].mean() - p[idx == b].mean()) * (idx == b).mean() for b in range(bins) if (idx == b).any()))


def prior_shift(p: np.ndarray, sample_prev: float, target_prev: float) -> np.ndarray:
    odds = p / (1 - p) * (target_prev / (1 - target_prev)) / (sample_prev / (1 - sample_prev))
    return odds / (1 + odds)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--assumed-prevalence", type=float, default=0.05)
    args = ap.parse_args()

    df = pd.read_csv(DATA)
    y = df["landslide"].to_numpy()
    cells = (df.longitude // 0.5).astype(int).astype(str) + "_" + (df.latitude // 0.5).astype(int).astype(str)

    oof = np.zeros(len(df))
    for tr, te in GroupKFold(n_splits=5).split(df, y, groups=cells):
        oof[te] = make_model().fit(df.iloc[tr][FEATURES], y[tr]).predict_proba(df.iloc[te][FEATURES])[:, 1]

    # honest estimate: calibrator itself is cross-validated over the same spatial groups
    cal_oof = np.zeros(len(df))
    for tr, te in GroupKFold(n_splits=5).split(df, y, groups=cells):
        lr = LogisticRegression(C=1e6).fit(logit(oof[tr]).reshape(-1, 1), y[tr])
        cal_oof[te] = lr.predict_proba(logit(oof[te]).reshape(-1, 1))[:, 1]
    print(f"in-distribution (prev={y.mean():.2f})  raw : Brier {brier_score_loss(y, oof):.4f}  ECE {ece(y, oof):.4f}")
    print(f"in-distribution (prev={y.mean():.2f})  Platt: Brier {brier_score_loss(y, cal_oof):.4f}  ECE {ece(y, cal_oof):.4f}")

    final = LogisticRegression(C=1e6).fit(logit(oof).reshape(-1, 1), y)
    a, b = float(final.coef_[0][0]), float(final.intercept_[0])
    sample_prev = float(y.mean())
    p_platt = final.predict_proba(logit(oof).reshape(-1, 1))[:, 1]
    p_real = prior_shift(p_platt, sample_prev, args.assumed_prevalence)
    print(f"assumed real prevalence {args.assumed_prevalence}: mean prob raw {oof.mean():.3f} -> calibrated {p_real.mean():.3f}; "
          f"share >=0.40: {np.mean(oof >= .40):.2f} -> {np.mean(p_real >= .40):.2f}; share >=0.75: {np.mean(oof >= .75):.2f} -> {np.mean(p_real >= .75):.2f}")

    out = ROOT / "models" / "risk_calibration.json"
    out.write_text(json.dumps({
        "method": "platt_on_spatial_oof + prior_shift", "platt_a": a, "platt_b": b,
        "sample_prevalence": sample_prev, "assumed_prevalence": args.assumed_prevalence,
        "note": "assumed_prevalence is an ASSUMPTION (no verified negatives yet); revisit with GSI/verified data.",
    }, indent=2), encoding="utf-8")
    print("saved", out)


if __name__ == "__main__":
    main()
