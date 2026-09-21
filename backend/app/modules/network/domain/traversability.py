"""
app/modules/network/domain/traversability.py — Pure Domain Traversability Evaluator.

Enforces physical and regulatory limits:
- Hard closures are strictly excluded
- Provisional cautions exclude critical dispatch
- Bridge limits never default to universally safe
- Missing critical dimensions cause explicit abstention
"""

from __future__ import annotations

from datetime import datetime

from app.modules.network.domain.entities import (
    EdgeRestriction,
    RoadEdge,
    TraversabilityResult,
    VehicleProfile,
)
from app.modules.network.domain.enums import AccessibilityStatus, RestrictionKind


def evaluate_traversability(
    vehicle: VehicleProfile,
    edge: RoadEdge,
    status: AccessibilityStatus,
    restrictions: list[EdgeRestriction],
    effective_time: datetime | None = None,
) -> TraversabilityResult:
    """
    Pure domain evaluator: (vehicle, edge, status, restrictions) -> TraversabilityResult.
    No I/O, database, or external state.
    """
    now = effective_time or datetime.now()

    # 1. Hard Closure (Systemdesign.md line 46: A verified closure remains excluded)
    if status == AccessibilityStatus.BLOCKED:
        return TraversabilityResult(
            can_traverse=False,
            requires_review=False,
            reason="Verified road closure on edge",
        )

    # 2. Provisional Caution (Systemdesign.md line 46: Conservative routing policy excludes for critical dispatch)
    if status == AccessibilityStatus.PROVISIONAL_CAUTION and vehicle.is_critical_dispatch:
        return TraversabilityResult(
            can_traverse=False,
            requires_review=True,
            reason="Provisional caution on edge under adjudication: critical dispatch excluded",
        )

    # 3. Unknown or Expired Status (Systemdesign.md line 46: On evidence expiry show UNKNOWN, never infer reopening)
    if status == AccessibilityStatus.UNKNOWN:
        return TraversabilityResult(
            can_traverse=False,
            requires_review=True,
            reason="Road accessibility status is unknown or expired: review required",
        )

    # 4. Filter active restrictions by validity window
    active_restrictions: list[EdgeRestriction] = []
    for r in restrictions:
        if r.valid_from and now < r.valid_from:
            continue
        if r.valid_until and now > r.valid_until:
            continue
        active_restrictions.append(r)

    # 5. Missing Critical Bridge Limits (Abstention rule - Systemdesign.md line 197)
    # Unknown critical bridge limits cause abstention, not an invented safe default.
    if edge.is_bridge and vehicle.is_heavy_vehicle:
        has_weight_limit = any(r.kind == RestrictionKind.MAX_WEIGHT for r in active_restrictions)
        if not has_weight_limit:
            return TraversabilityResult(
                can_traverse=False,
                requires_review=True,
                reason="Bridge structural capacity unknown for heavy vehicle: safety abstention requires manual review",
            )

    # 6. Physical Dimensions & Weight Checks
    for r in active_restrictions:
        if r.kind == RestrictionKind.MAX_WEIGHT and r.value_numeric is not None:
            if vehicle.gross_weight_tonnes > r.value_numeric:
                return TraversabilityResult(
                    can_traverse=False,
                    requires_review=False,
                    reason=f"Vehicle gross weight ({vehicle.gross_weight_tonnes}t) exceeds limit ({r.value_numeric}t)",
                )

        if r.kind == RestrictionKind.MAX_HEIGHT and r.value_numeric is not None:
            if vehicle.height_meters > r.value_numeric:
                return TraversabilityResult(
                    can_traverse=False,
                    requires_review=False,
                    reason=f"Vehicle height ({vehicle.height_meters}m) exceeds vertical clearance ({r.value_numeric}m)",
                )

        if r.kind == RestrictionKind.MAX_WIDTH and r.value_numeric is not None:
            if vehicle.width_meters > r.value_numeric:
                return TraversabilityResult(
                    can_traverse=False,
                    requires_review=False,
                    reason=f"Vehicle width ({vehicle.width_meters}m) exceeds roadway width ({r.value_numeric}m)",
                )

        if r.kind == RestrictionKind.HAZARDOUS_CARGO_PROHIBITED and vehicle.is_hazardous_cargo:
            return TraversabilityResult(
                can_traverse=False,
                requires_review=False,
                reason="Hazardous cargo transit prohibited on this corridor",
            )

        if r.kind == RestrictionKind.NIGHT_CURFEW:
            # Check night curfew (e.g. 20:00 to 05:00)
            hour = now.hour
            if hour >= 20 or hour < 5:
                return TraversabilityResult(
                    can_traverse=False,
                    requires_review=True,
                    reason="Night security/weather curfew in effect on corridor",
                )

    # 7. Restricted status with non-fatal advisory delay
    if status == AccessibilityStatus.RESTRICTED:
        return TraversabilityResult(
            can_traverse=True,
            requires_review=False,
            reason="Edge traversable under active advisory conditions",
            delay_penalty_seconds=300.0,  # 5 min speed reduction penalty
        )

    # 8. Fully Traversable
    return TraversabilityResult(
        can_traverse=True,
        requires_review=False,
        reason="Edge fully traversable",
        delay_penalty_seconds=0.0,
    )
