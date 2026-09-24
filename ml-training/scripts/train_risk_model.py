"""
ml-training/scripts/train_risk_model.py — Module 2: Landslide/Disruption Risk Model Training.

Trains an XGBoost binary classifier for P(blocked_within_24h | edge features).
Uses SYNTHETIC data by default (see generate_synthetic_dataset.py) — this
proves the pipeline end-to-end (spatial-temporal holdout, PR-AUC/Brier
evaluation, SHAP explainability, model export) but the reported metrics have
no real-world meaning until swapped for real feature-store data.

To train on real data instead: export backend's `edge_terrain_features` +
`edge_weather_features` + `landslide_events` tables (joined on edge_id, with
a real corridor-segment and monsoon-year label per row) to a CSV with the
same column names as generate_synthetic_dataset.generate_synthetic_edge_features(),
then run:

    python scripts/train_risk_model.py --data-path <your_real_export.csv>

Enforces aiml developer.md Phase 3's mandatory rule: NEVER split randomly on
spatiotemporal data. Uses a spatial-temporal BLOCK holdout instead:
  - Temporal: train on monsoons 2022-2024, test on monsoon 2025.
  - Spatial: entirely hold out one corridor segment from training.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.metrics import average_precision_score, brier_score_loss

FEATURE_COLUMNS = [
    "slope_pct",
    "elevation_mean_m",
    "curvature_index",
    "distance_to_stream_m",
    "susceptibility_zone_score",
    "rainfall_72h_mm",
    "ari_score",
    "soil_moisture_index",
]
TARGET_COLUMN = "blocked_within_24h"

# Spatial-temporal block holdout configuration (aiml developer.md Phase 3).
HOLDOUT_TEST_MONSOON_YEAR = 2025
HOLDOUT_TEST_CORRIDOR_SEGMENT = "NONGPOH_SHILLONG"


def spatial_temporal_block_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Split into train/test WITHOUT randomizing across space or time:
      - test = monsoon 2025 records OR records from the held-out corridor segment
      - train = everything else

    This is deliberately stricter than a pure temporal split: it also checks
    out-of-corridor generalization, per the plan's explicit requirement.
    """
    is_test = (df["monsoon_year"] == HOLDOUT_TEST_MONSOON_YEAR) | (
        df["corridor_segment"] == HOLDOUT_TEST_CORRIDOR_SEGMENT
    )
    return df[~is_test].copy(), df[is_test].copy()


def train_and_evaluate(df: pd.DataFrame) -> dict[str, float]:
    train_df, test_df = spatial_temporal_block_split(df)
    if train_df.empty or test_df.empty:
        raise ValueError(
            "Spatial-temporal split produced an empty train or test set — "
            "check that the input data actually contains the configured "
            f"holdout year ({HOLDOUT_TEST_MONSOON_YEAR}) and corridor segment "
            f"({HOLDOUT_TEST_CORRIDOR_SEGMENT})."
        )

    x_train, y_train = train_df[FEATURE_COLUMNS], train_df[TARGET_COLUMN]
    x_test, y_test = test_df[FEATURE_COLUMNS], test_df[TARGET_COLUMN]

    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="aucpr",
        random_state=42,
    )
    model.fit(x_train, y_train)

    predicted_proba = model.predict_proba(x_test)[:, 1]
    pr_auc = float(average_precision_score(y_test, predicted_proba))
    brier = float(brier_score_loss(y_test, predicted_proba))

    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(x_test)
    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    top_features = sorted(
        zip(FEATURE_COLUMNS, mean_abs_shap.tolist(), strict=True),
        key=lambda pair: pair[1],
        reverse=True,
    )

    print(f"Train rows: {len(train_df)}, Test rows: {len(test_df)}")
    print(f"PR-AUC:      {pr_auc:.4f}  (SIH target on REAL data: >= 0.84)")
    print(f"Brier score: {brier:.4f}  (SIH target on REAL data: <  0.08)")
    print("Top SHAP feature contributions (mean |SHAP value|):")
    for name, value in top_features[:5]:
        print(f"  {name:28s} {value:.4f}")

    models_dir = Path(__file__).resolve().parent.parent / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / "risk_model_xgboost.pkl"
    joblib.dump(model, model_path)
    print(f"Saved model to {model_path}")

    metrics = {
        "pr_auc": pr_auc,
        "brier_score": brier,
        "train_rows": len(train_df),
        "test_rows": len(test_df),
        "top_shap_features": [{"feature": n, "mean_abs_shap": v} for n, v in top_features],
    }
    metrics_path = models_dir / "risk_model_metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved metrics to {metrics_path}")

    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    default_path = Path(__file__).resolve().parent.parent / "data" / "synthetic" / "synthetic_risk_dataset.csv"
    parser.add_argument("--data-path", type=Path, default=default_path)
    args = parser.parse_args()

    if not args.data_path.exists():
        raise FileNotFoundError(
            f"{args.data_path} not found — run generate_synthetic_dataset.py first, "
            "or pass --data-path to a real feature-store export."
        )

    df = pd.read_csv(args.data_path)
    train_and_evaluate(df)


if __name__ == "__main__":
    main()
