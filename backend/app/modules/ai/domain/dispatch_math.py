"""
app/modules/ai/domain/dispatch_math.py — Pure Math for Module 5 (Dispatch Optimization).

No IO, no ortools dependency — only the distance-matrix construction and
risk-penalty weighting that ai/infrastructure/ortools_dispatch_solver.py
feeds into the solver. Kept pure and dependency-free so it is unit-testable
without the ortools library installed.
"""

from __future__ import annotations

from app.modules.ai.domain.feature_math import haversine_meters

# Average effective road speed used to convert distance to a duration
# estimate for hill-terrain logistics routes (aiml developer.md's own
# "flat-speed" baseline that Module 3 exists to replace for a single route —
# here it's only used as a rough total-route duration summary, not a
# per-edge prediction).
AVERAGE_ROUTE_SPEED_MPS = 40_000.0 / 3600.0  # 40 km/h


def build_haversine_distance_matrix(points: list[tuple[float, float]]) -> list[list[float]]:
    """
    Build an NxN great-circle distance matrix (meters) for (lon, lat) points.
    A straight-line approximation — real pgRouting network distances would be
    more accurate but require a live database; documented as a known
    simplification (see ortools_dispatch_solver.py module docstring).
    """
    n = len(points)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                matrix[i][j] = haversine_meters(
                    points[i][0], points[i][1], points[j][0], points[j][1]
                )
    return matrix


def apply_risk_penalty(
    distance_matrix: list[list[float]],
    risk_penalties: list[float],
    weight: float = 1.0,
) -> list[list[float]]:
    """
    Inflate each arc's cost by the destination stop's risk penalty:
    cost[i][j] = distance[i][j] * (1 + weight * risk_penalties[j])

    This implements aiml developer.md Module 5's w2*DisruptionRisk term as an
    arc-cost multiplier rather than an additive term, so the solver still
    respects the triangle-inequality-like structure OR-Tools expects.
    """
    n = len(distance_matrix)
    if len(risk_penalties) != n:
        raise ValueError(
            f"risk_penalties length ({len(risk_penalties)}) must match "
            f"distance_matrix size ({n})"
        )
    penalized: list[list[float]] = []
    for i in range(n):
        row: list[float] = []
        for j in range(n):
            if i == j:
                row.append(0.0)
            else:
                row.append(distance_matrix[i][j] * (1.0 + weight * risk_penalties[j]))
        penalized.append(row)
    return penalized


def estimate_duration_seconds(distance_meters: float) -> float:
    """Rough total-route duration estimate at AVERAGE_ROUTE_SPEED_MPS."""
    if distance_meters < 0.0:
        raise ValueError(f"distance_meters must be >= 0.0, got {distance_meters}")
    return distance_meters / AVERAGE_ROUTE_SPEED_MPS
