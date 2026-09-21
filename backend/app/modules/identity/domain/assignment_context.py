"""
app/modules/identity/domain/assignment_context.py — Contract for resource-level assignment context.

Defined in Phase 2 as an immutable contract (Fix 15).
Phase 5 will query vehicle_assignments, trip_assignments, and asset_assignments.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID


@dataclass(frozen=True)
class AssignmentContext:
    """
    Resource-level assignment information for operational principals.

    Phase 2: Defaults to empty sets. Methods allow access by default when empty
    (stub behavior) so operational flows are not blocked until Phase 5 models exist.
    Phase 5: Populates these from persistence and tightens to strict checks.

    CONTRACT (immutable across phases):
    - A Transport Operator can only access their ASSIGNED vehicle/trip
    - A Field Officer can only access resources in their ASSIGNED area
    - A Road Inspector can only submit for their ASSIGNED assets
    - Assignment status is checked AFTER capability check
    - Assignment expiry is honored (time-bounded assignments)
    """
    assigned_vehicle_ids: frozenset[UUID] = field(default_factory=frozenset)
    assigned_trip_ids: frozenset[UUID] = field(default_factory=frozenset)
    assigned_area_jurisdiction_ids: frozenset[UUID] = field(default_factory=frozenset)
    assigned_asset_ids: frozenset[UUID] = field(default_factory=frozenset)

    def is_assigned_to_vehicle(self, vehicle_id: UUID) -> bool:
        """Return True if principal is assigned to vehicle, or if no vehicle assignments exist in Phase 2."""
        if not self.assigned_vehicle_ids:
            return True
        return vehicle_id in self.assigned_vehicle_ids

    def is_assigned_to_trip(self, trip_id: UUID) -> bool:
        """Return True if principal is assigned to trip, or if no trip assignments exist in Phase 2."""
        if not self.assigned_trip_ids:
            return True
        return trip_id in self.assigned_trip_ids

    def is_assigned_to_area(self, jurisdiction_id: UUID) -> bool:
        """Return True if principal is assigned to area, or if no area assignments exist in Phase 2."""
        if not self.assigned_area_jurisdiction_ids:
            return True
        return jurisdiction_id in self.assigned_area_jurisdiction_ids

    def is_assigned_to_asset(self, asset_id: UUID) -> bool:
        """Return True if principal is assigned to asset, or if no asset assignments exist in Phase 2."""
        if not self.assigned_asset_ids:
            return True
        return asset_id in self.assigned_asset_ids
