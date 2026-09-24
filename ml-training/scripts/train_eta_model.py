"""
ml-training/scripts/train_eta_model.py — Module 3: Mountain Vehicle Traversal ETA Model Training.

Trains a CatBoost regression model for travel-time prediction, with monotonic
constraints enforcing that higher elevation gain, tortuosity, rainfall, and
vehicle weight can never DECREASE the predicted duration (aiml developer.md
§2 Module 3). Uses SYNTHETIC data by default — see the module docstring in
generate_synthetic_dataset.py for why, and how to swap in real telemetry data.

Usage:
    python scripts/train_eta_model.py
    python scripts/train_eta_model.py --data-path <real_trip_duration_export.csv>
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor, Pool
from sklearn.model_selection import train_test_split

FEATURE_COLUMNS = [
    "length_km",
    "elevation_gain_m",
    "tortuosity_index",
    "rainfall_rate_mmhr",
    "vehicle_weight_kg",
]
TARGET_COLUMN = "duration_seconds"

# Monotonic constraints, one per FEATURE_COLUMNS entry, in the same order:
# +1 = prediction must be non-decreasing as the feature increases.
#  0 = no constraint.
# All 4 physical delay drivers are constrained upward; length_km is left
# unconstrained since it trades off against effective speed non-monotonically
# in this synthetic formulation (longer segments are not inherently "slower per km").
MONOTONIC_CONSTRAINTS = [0, 1, 1, 1, 1]


def mean_absolute_percentage_error(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs((y_true - y_pred) / y_true)) * 100.0)


def train_and_evaluate(df: pd.DataFrame) -> dict[str, float]:
    x = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]

    # NOTE: a plain random split is acceptable here (unlike the risk model) —
    # ETA training rows are independent per-trip samples, not a spatiotemporal
    # event series, so there is no leakage risk analogous to Module 2.
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42)

    train_pool = Pool(x_train, y_train)
    test_pool = Pool(x_test, y_test)

    model = CatBoostRegressor(
        iterations=500,
        depth=6,
        learning_rate=0.05,
        loss_function="RMSE",
        monotone_constraints=MONOTONIC_CONSTRAINTS,
        random_seed=42,
        verbose=False,
    )
    model.fit(train_pool, eval_set=test_pool)

    predictions = model.predict(x_test)
    mape = mean_absolute_percentage_error(y_test.to_numpy(), predictions)

    # Confidence band: use the residual standard deviation on the test set as
    # a simple homoscedastic approximation. Phase 3 (real backend inference)
    # should replace this with CatBoost's native uncertainty estimation
    # (virtual ensembles) once trained on real data.
    residual_std = float(np.std(y_test.to_numpy() - predictions))

    print(f"Train rows: {len(x_train)}, Test rows: {len(x_test)}")
    print(f"MAPE: {mape:.2f}%  (SIH target on REAL data: < 9.5%)")
    print(f"Residual std (for confidence band): {residual_std:.1f}s")

    models_dir = Path(__file__).resolve().parent.parent / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / "eta_model_catboost.cbm"
    model.save_model(str(model_path))
    print(f"Saved model to {model_path}")

    metrics = {
        "mape_pct": mape,
        "residual_std_seconds": residual_std,
        "train_rows": len(x_train),
        "test_rows": len(x_test),
    }
    metrics_path = models_dir / "eta_model_metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved metrics to {metrics_path}")

    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    default_path = Path(__file__).resolve().parent.parent / "data" / "synthetic" / "synthetic_eta_dataset.csv"
    parser.add_argument("--data-path", type=Path, default=default_path)
    args = parser.parse_args()

    if not args.data_path.exists():
        raise FileNotFoundError(
            f"{args.data_path} not found — run generate_synthetic_dataset.py first, "
            "or pass --data-path to a real trip-duration export."
        )

    df = pd.read_csv(args.data_path)
    train_and_evaluate(df)


if __name__ == "__main__":
    main()
