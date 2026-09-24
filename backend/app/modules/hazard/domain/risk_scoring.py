"""
app/modules/hazard/domain/risk_scoring.py — Pure landslide-risk scoring functions.

No I/O. Combines terrain steepness with live rainfall intensity into a single
0.0-1.0 risk score, and classifies that score into a coarse RiskLevel band for
UI display (map overlay coloring, alerting thresholds, etc.).
"""

from __future__ import annotations

import math

from app.modules.hazard.domain.enums import RiskLevel


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def compute_risk_score(
    gradient_percent: float,
    rainfall_mm_24h: float,
    rainfall_mm_72h: float,
) -> float:
    """
    Computes a weighted 0.0-1.0 landslide-risk score.

    Weighting rationale (North-East India hilly terrain):
    - Terrain gradient is the dominant static predisposing factor (steeper slopes
      fail more readily under saturation) — weight 0.40.
    - 24h rainfall intensity is the strongest dynamic trigger for shallow
      landslides — weight 0.45.
    - 72h accumulated rainfall captures soil saturation / antecedent moisture,
      a secondary but still material contributor — weight 0.15.

    Normalization:
    - gradient_factor: gradient_percent / 40.0, clamped to [0, 1] (40% grade ~ near-vertical
      terrain in road-network terms, treated as the practical ceiling).
    - rainfall_24h_factor: rainfall_mm_24h / 100.0, clamped to [0, 1] (100mm/24h is classified
      "very heavy rainfall" by IMD).
    - rainfall_72h_factor: rainfall_mm_72h / 200.0, clamped to [0, 1].

    Returns a float in [0.0, 1.0].
    """
    if math.isnan(gradient_percent) or math.isinf(gradient_percent):
        gradient_percent = 0.0
    if math.isnan(rainfall_mm_24h) or math.isinf(rainfall_mm_24h):
        rainfall_mm_24h = 0.0
    if math.isnan(rainfall_mm_72h) or math.isinf(rainfall_mm_72h):
        rainfall_mm_72h = 0.0

    gradient_factor = _clamp01(gradient_percent / 40.0)
    rainfall_24h_factor = _clamp01(rainfall_mm_24h / 100.0)
    rainfall_72h_factor = _clamp01(rainfall_mm_72h / 200.0)

    score = (
        0.40 * gradient_factor
        + 0.45 * rainfall_24h_factor
        + 0.15 * rainfall_72h_factor
    )
    return _clamp01(score)


def score_to_level(score: float) -> RiskLevel:
    """Classifies a 0.0-1.0 risk score into a coarse RiskLevel band."""
    if score < 0.3:
        return RiskLevel.LOW
    elif score < 0.55:
        return RiskLevel.MODERATE
    elif score < 0.8:
        return RiskLevel.HIGH
    return RiskLevel.SEVERE


def derive_polygon_ring(
    center_lon: float,
    center_lat: float,
    radius_m: float = 400.0,
    points: int = 12,
) -> list[tuple[float, float]]:
    """
    Generates a simple closed circular polygon ring (lon, lat pairs) around a center
    point, approximating meters-to-degrees conversion using the local latitude's
    cosine (valid for the small radii used here, ~hundreds of meters).

    The returned ring is closed: first coordinate == last coordinate, as required
    by the GeoJSON Polygon spec.
    """
    if points < 3:
        points = 3

    earth_radius_m = 6371000.0
    lat_rad = math.radians(center_lat)

    # Degrees-per-meter at this latitude
    deg_lat_per_m = 180.0 / (math.pi * earth_radius_m)
    deg_lon_per_m = deg_lat_per_m / max(math.cos(lat_rad), 1e-6)

    ring: list[tuple[float, float]] = []
    for i in range(points):
        theta = 2.0 * math.pi * (i / points)
        dx_m = radius_m * math.cos(theta)
        dy_m = radius_m * math.sin(theta)
        lon = center_lon + dx_m * deg_lon_per_m
        lat = center_lat + dy_m * deg_lat_per_m
        ring.append((lon, lat))

    # Close the ring
    ring.append(ring[0])
    return ring
