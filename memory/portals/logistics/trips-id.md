# Logistics / Trip detail

- **Route:** /logistics/trips/[id]
- **Source:** frontend/src/app/(protected)/logistics/trips/[id]/page.tsx
- **Roles / capabilities:** Logistics surface: FLEET_MANAGER, DELIVERY_COORDINATOR, TRANSPORT_OPERATOR. Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Trip map, stops, impacts, consignments, status transitions.

## Key components / features
- `TripDetail` (vehicleBase=/logistics/vehicles): Renders trip route on `MapView` using `useRoutePlan(current_route_snapshot_id)` to render authentic road-following polylines (`primary_geometry` and alternatives) when available, falling back to stop sequence only if no snapshot is linked.

## Data & API
- GET /logistics/trips/{id}; POST /logistics/trips/{id}/transition; GET /trips/{id}/impacts; GET /api/v1/routes/{route_plan_id}.

## Behaviour notes
Renders road curvature on map; supports route evaluation and dispatch decisions.

## Tests
Covered in fleet integration tests.

## Known issues / TODO
- None recorded.
