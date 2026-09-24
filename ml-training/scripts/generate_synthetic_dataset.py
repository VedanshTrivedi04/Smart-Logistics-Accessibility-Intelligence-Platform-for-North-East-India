"""
ml-training/scripts/generate_synthetic_dataset.py — Synthetic Training Data Generator.

IMPORTANT: This data is entirely synthetic. It exists ONLY to prove the
training pipeline (feature joins, spatial-temporal holdout, model fitting,
evaluation, SHAP explainability, export) is implemented correctly end-to-end.
It must NOT be used to draw any conclusion about real-world model accuracy,
and the metrics reported by train_risk_model.py / train_eta_model.py on this
data are meaningless outside of "did the code run correctly."

Once real data is sourced (GSI Bhusanket landslide catalog, SRTM DEM via
backend/app/scripts/compute_terrain_features.py, real IMD rainfall via
backend/app/scripts/ingest_weather_features.py), replace the two `load_*`
functions in train_risk_model.py / train_eta_model.py with a real export
from the backend's Postgres feature-store tables (edge_terrain_features,
edge_weather_features, landslide_events) and delete this generator.

Synthetic edges are assigned to one of 3 fictional "corridor segments" and
one of 4 fictional "monsoon years" so that train_risk_model.py has something
non-trivial to hold out on for the mandatory spatial-temporal block split
(aiml developer.md Phase 3: "NEVER split randomly on spatiotemporal data").
"""

from __future__ import annotations

import numpy as np
import pandas as pd

RNG_SEED = 42
N_EDGES = 4000
CORRIDOR_SEGMENTS = ["JORABAT_NONGPOH", "NONGPOH_SHILLONG", "SHILLONG_SILCHAR"]
MONSOON_YEARS = [2022, 2023, 2024, 2025]


def generate_synthetic_edge_features(n_edges: int = N_EDGES, seed: int = RNG_SEED) -> pd.DataFrame:
    """
    Generate one synthetic (edge, monsoon_year) observation per row with
    terrain + weather features and a deliberately-correlated synthetic
    landslide label, so a fitted model shows sane (not random) SHAP signs.
    """
    rng = np.random.default_rng(seed)

    n = n_edges
    corridor_segment = rng.choice(CORRIDOR_SEGMENTS, size=n)
    monsoon_year = rng.choice(MONSOON_YEARS, size=n)

    slope_pct = np.clip(rng.gamma(shape=2.0, scale=8.0, size=n), 0.0, 80.0)
    elevation_mean_m = rng.normal(loc=900.0, scale=400.0, size=n).clip(min=20.0)
    curvature_index = np.clip(rng.gamma(shape=2.0, scale=0.4, size=n) + 1.0, 1.0, 4.0)
    distance_to_stream_m = np.clip(rng.exponential(scale=400.0, size=n), 5.0, 5000.0)
    susceptibility_zone_score = np.clip(
        # Correlated with slope so susceptibility_zone is not pure noise.
        (slope_pct / 80.0) + rng.normal(0.0, 0.15, size=n),
        0.0,
        1.0,
    )

    rainfall_72h_mm = np.clip(rng.gamma(shape=2.0, scale=40.0, size=n), 0.0, 600.0)
    ari_score = rainfall_72h_mm * rng.uniform(0.3, 0.6, size=n)
    soil_moisture_index = np.clip(rainfall_72h_mm / 600.0 + rng.normal(0.0, 0.1, size=n), 0.0, 1.0)

    # Synthetic ground truth: higher slope + higher rainfall + closer to a
    # stream + higher susceptibility -> higher blockage log-odds. Coefficients
    # are illustrative only, not calibrated against any real event data.
    logit = (
        -4.0
        + 0.05 * slope_pct
        + 0.01 * ari_score
        + 2.0 * susceptibility_zone_score
        + 0.0008 * (1000.0 - np.minimum(distance_to_stream_m, 1000.0))
        + rng.normal(0.0, 0.5, size=n)
    )
    probability = 1.0 / (1.0 + np.exp(-logit))
    blocked_within_24h = rng.binomial(1, probability)

    return pd.DataFrame(
        {
            "edge_id": [f"synthetic-edge-{i:05d}" for i in range(n)],
            "corridor_segment": corridor_segment,
            "monsoon_year": monsoon_year,
            "slope_pct": slope_pct,
            "elevation_mean_m": elevation_mean_m,
            "curvature_index": curvature_index,
            "distance_to_stream_m": distance_to_stream_m,
            "susceptibility_zone_score": susceptibility_zone_score,
            "rainfall_72h_mm": rainfall_72h_mm,
            "ari_score": ari_score,
            "soil_moisture_index": soil_moisture_index,
            "blocked_within_24h": blocked_within_24h,
        }
    )


def generate_synthetic_eta_dataset(n_trips: int = N_EDGES, seed: int = RNG_SEED) -> pd.DataFrame:
    """
    Generate synthetic (route-segment, vehicle, weather) rows with a
    physically-plausible (if illustrative) travel-time target, for proving
    out the CatBoost monotonic-constraint ETA regression pipeline.
    """
    rng = np.random.default_rng(seed + 1)

    n = n_trips
    length_km = np.clip(rng.gamma(shape=2.0, scale=4.0, size=n), 0.5, 60.0)
    elevation_gain_m = np.clip(rng.gamma(shape=2.0, scale=100.0, size=n), 0.0, 1500.0)
    tortuosity_index = np.clip(rng.gamma(shape=2.0, scale=0.4, size=n) + 1.0, 1.0, 4.0)
    rainfall_rate_mmhr = np.clip(rng.exponential(scale=5.0, size=n), 0.0, 80.0)
    vehicle_weight_kg = rng.uniform(3000.0, 25000.0, size=n)

    base_speed_kmh = 45.0
    # Monotonic: higher gain/tortuosity/rain/weight -> slower (fewer km/h).
    effective_speed_kmh = np.clip(
        base_speed_kmh
        - 0.01 * elevation_gain_m
        - 4.0 * (tortuosity_index - 1.0)
        - 0.4 * rainfall_rate_mmhr
        - 0.0005 * vehicle_weight_kg
        + rng.normal(0.0, 2.0, size=n),
        5.0,
        base_speed_kmh,
    )
    duration_seconds = (length_km / effective_speed_kmh) * 3600.0

    return pd.DataFrame(
        {
            "length_km": length_km,
            "elevation_gain_m": elevation_gain_m,
            "tortuosity_index": tortuosity_index,
            "rainfall_rate_mmhr": rainfall_rate_mmhr,
            "vehicle_weight_kg": vehicle_weight_kg,
            "duration_seconds": duration_seconds,
        }
    )


if __name__ == "__main__":
    from pathlib import Path

    out_dir = Path(__file__).resolve().parent.parent / "data" / "synthetic"
    out_dir.mkdir(parents=True, exist_ok=True)

    risk_df = generate_synthetic_edge_features()
    risk_df.to_csv(out_dir / "synthetic_risk_dataset.csv", index=False)
    print(f"Wrote {len(risk_df)} rows to {out_dir / 'synthetic_risk_dataset.csv'}")

    eta_df = generate_synthetic_eta_dataset()
    eta_df.to_csv(out_dir / "synthetic_eta_dataset.csv", index=False)
    print(f"Wrote {len(eta_df)} rows to {out_dir / 'synthetic_eta_dataset.csv'}")
