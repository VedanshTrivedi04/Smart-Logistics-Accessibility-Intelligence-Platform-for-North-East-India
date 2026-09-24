"""
app/modules/ai/domain/feature_math.py — Pure Feature-Engineering Math for AI/ML Module.

No IO, no ORM, no HTTP — only deterministic numeric transforms shared by the
offline ingestion scripts (app/scripts/) and, later, by Phase 3 inference
feature-vector construction. Kept in domain/ so it is unit-testable in
isolation and cannot silently grow a database or network dependency.
"""

from __future__ import annotations

import math
from datetime import datetime
from uuid import UUID

from app.modules.ai.domain.entities import TerrainFeatures, WeatherFeatures
from app.modules.ai.domain.enums import SusceptibilityZone

# Canonical ordered column names the Module 2 (risk) and Module 3 (ETA) models
# were trained on — must stay in sync with ml-training/scripts/train_risk_model.py
# FEATURE_COLUMNS and train_eta_model.py FEATURE_COLUMNS respectively. Retraining
# on real data must keep these names identical, or update both sides together.
RISK_FEATURE_COLUMNS = [
    "slope_pct",
    "elevation_mean_m",
    "curvature_index",
    "distance_to_stream_m",
    "susceptibility_zone_score",
    "rainfall_72h_mm",
    "ari_score",
    "soil_moisture_index",
]
ETA_FEATURE_COLUMNS = [
    "length_km",
    "elevation_gain_m",
    "tortuosity_index",
    "rainfall_rate_mmhr",
    "vehicle_weight_kg",
]

# Maps the categorical SusceptibilityZone enum onto the continuous
# [0.0, 1.0] score the risk model was trained on (see ml-training's
# generate_synthetic_dataset.susceptibility_zone_score). Midpoints of four
# equal bands — an approximation until the model is retrained directly on
# the categorical zone (e.g. via one-hot encoding) using real GSI data.
SUSCEPTIBILITY_ZONE_SCORE = {
    SusceptibilityZone.LOW: 0.125,
    SusceptibilityZone.MEDIUM: 0.375,
    SusceptibilityZone.HIGH: 0.625,
    SusceptibilityZone.VERY_HIGH: 0.875,
}

# Interim slope-only susceptibility heuristic used until a real GSI Bhusanket
# susceptibility-zone overlay is available (see aiml developer.md Module 2).
# Replace `classify_susceptibility_zone_by_slope` with a GSI polygon lookup
# once the shapefile/raster has been sourced (Phase 1 critical-path item).
_SLOPE_ZONE_THRESHOLDS_PCT = (15.0, 25.0, 35.0)

# Antecedent Rainfall Index soil-moisture decay coefficient (aiml developer.md §3 Phase 2).
ARI_DECAY_COEFFICIENT = 0.85
ARI_WINDOW_DAYS = 7


def compute_antecedent_rainfall_index(
    daily_rainfall_mm: list[float],
    decay: float = ARI_DECAY_COEFFICIENT,
) -> float:
    """
    Compute the Antecedent Rainfall Index: ARI_t = sum(decay^i * R_{t-i}) for i=1..k.

    `daily_rainfall_mm` must be ordered most-recent-first, i.e. index 0 is
    yesterday's rainfall (R_{t-1}), index 1 is two days ago (R_{t-2}), etc.
    Only the most recent ARI_WINDOW_DAYS entries are used; fewer entries are
    accepted (e.g. at the start of a rolling window) and simply sum over what
    is available.
    """
    if not daily_rainfall_mm:
        return 0.0
    if any(r < 0.0 for r in daily_rainfall_mm):
        raise ValueError("daily_rainfall_mm values must be non-negative")
    if not (0.0 < decay < 1.0):
        raise ValueError(f"decay must be in (0.0, 1.0), got {decay}")

    window = daily_rainfall_mm[:ARI_WINDOW_DAYS]
    return sum((decay ** (i + 1)) * rainfall for i, rainfall in enumerate(window))


def compute_slope_percent(rise_m: float, run_m: float) -> float:
    """
    Compute slope as a percentage grade: 100 * rise / run.

    `run_m` is the horizontal distance; a near-zero run (e.g. a degenerate
    2-point sample) is treated as a very steep/near-vertical segment rather
    than dividing by zero.
    """
    if run_m <= 1e-6:
        return 100.0 if rise_m > 0.0 else 0.0
    return 100.0 * abs(rise_m) / run_m


def compute_slope_degrees(rise_m: float, run_m: float) -> float:
    """Compute slope as an angle in degrees from rise/run."""
    if run_m <= 1e-6:
        return 90.0 if rise_m > 0.0 else 0.0
    return math.degrees(math.atan2(abs(rise_m), run_m))


def compute_aspect_degrees(dx: float, dy: float) -> float:
    """
    Compute compass aspect (0-360 degrees, 0=North, 90=East) of a downslope
    direction vector (dx, dy) in a local planar projection.
    """
    angle = math.degrees(math.atan2(dx, dy))
    return angle % 360.0


def haversine_meters(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in meters between two (lon, lat) points (WGS84)."""
    earth_radius_m = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * earth_radius_m * math.asin(math.sqrt(a))


def compute_tortuosity_index(coordinates: list[tuple[float, float]], length_meters: float) -> float:
    """
    Compute a curvature/tortuosity index: path length divided by straight-line
    (great-circle) distance between the edge's endpoints. A value of 1.0 means
    perfectly straight; higher values indicate more hairpin bends/curvature.
    """
    if len(coordinates) < 2:
        raise ValueError("coordinates must contain at least 2 points")
    if length_meters <= 0.0:
        raise ValueError(f"length_meters must be > 0.0, got {length_meters}")

    (lon1, lat1), (lon2, lat2) = coordinates[0], coordinates[-1]
    straight_line_m = haversine_meters(lon1, lat1, lon2, lat2)
    if straight_line_m <= 1e-6:
        # Endpoints coincide (e.g. a loop) — treat as maximally tortuous rather than divide by zero.
        return length_meters
    return length_meters / straight_line_m


def classify_susceptibility_zone_by_slope(slope_pct: float) -> SusceptibilityZone:
    """
    Interim slope-only landslide susceptibility heuristic (see module docstring
    note above). Thresholds are indicative NE-India hill-terrain bands, not a
    calibrated model — Phase 2 training should treat this column as a feature,
    not ground truth.
    """
    low, medium, high = _SLOPE_ZONE_THRESHOLDS_PCT
    if slope_pct < low:
        return SusceptibilityZone.LOW
    if slope_pct < medium:
        return SusceptibilityZone.MEDIUM
    if slope_pct < high:
        return SusceptibilityZone.HIGH
    return SusceptibilityZone.VERY_HIGH


def build_terrain_features(
    edge_id: UUID,
    coordinates: list[tuple[float, float]],
    length_meters: float,
    elevations_m: list[float],
    distance_to_stream_m: float,
    computed_at: datetime,
) -> TerrainFeatures:
    """
    Combine a DEM-sampled elevation profile and edge geometry into a
    TerrainFeatures record. Pure function — the caller (a script or
    infrastructure adapter) is responsible for actually reading the DEM
    raster and road-edge geometry.
    """
    if not elevations_m:
        raise ValueError("elevations_m must not be empty")
    if len(coordinates) < 2:
        raise ValueError("coordinates must contain at least 2 points")

    elevation_min = min(elevations_m)
    elevation_max = max(elevations_m)
    elevation_mean = sum(elevations_m) / len(elevations_m)

    slope_pct = compute_slope_percent(rise_m=elevation_max - elevation_min, run_m=length_meters)

    (lon1, lat1), (lon2, lat2) = coordinates[0], coordinates[-1]
    aspect_deg = compute_aspect_degrees(dx=lon2 - lon1, dy=lat2 - lat1)

    curvature_index = compute_tortuosity_index(coordinates, length_meters)

    return TerrainFeatures(
        edge_id=edge_id,
        elevation_min_m=elevation_min,
        elevation_max_m=elevation_max,
        elevation_mean_m=elevation_mean,
        slope_pct=slope_pct,
        aspect_deg=aspect_deg,
        curvature_index=curvature_index,
        susceptibility_zone=classify_susceptibility_zone_by_slope(slope_pct),
        distance_to_stream_m=distance_to_stream_m,
        computed_at=computed_at,
    )


def build_risk_feature_vector(
    terrain: TerrainFeatures,
    weather: WeatherFeatures,
) -> dict[str, float]:
    """
    Combine a TerrainFeatures + WeatherFeatures pair into the exact ordered
    feature vector the Module 2 risk model expects (RISK_FEATURE_COLUMNS).
    """
    return {
        "slope_pct": terrain.slope_pct,
        "elevation_mean_m": terrain.elevation_mean_m,
        "curvature_index": terrain.curvature_index,
        "distance_to_stream_m": terrain.distance_to_stream_m,
        "susceptibility_zone_score": SUSCEPTIBILITY_ZONE_SCORE[terrain.susceptibility_zone],
        "rainfall_72h_mm": weather.rainfall_72h_mm,
        "ari_score": weather.ari_score,
        "soil_moisture_index": weather.soil_moisture_index,
    }


def build_eta_feature_vector(
    length_km: float,
    elevation_gain_m: float,
    tortuosity_index: float,
    rainfall_rate_mmhr: float,
    vehicle_weight_kg: float,
) -> dict[str, float]:
    """
    Combine per-edge geometry, weather, and vehicle attributes into the exact
    ordered feature vector the Module 3 ETA model expects (ETA_FEATURE_COLUMNS).
    """
    return {
        "length_km": length_km,
        "elevation_gain_m": elevation_gain_m,
        "tortuosity_index": tortuosity_index,
        "rainfall_rate_mmhr": rainfall_rate_mmhr,
        "vehicle_weight_kg": vehicle_weight_kg,
    }
