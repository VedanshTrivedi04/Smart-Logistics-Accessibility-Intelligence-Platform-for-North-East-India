# Gov / Trip detail

- **Route:** /gov/fleet/trips/[id]
- **Source:** frontend/src/app/(protected)/gov/fleet/trips/[id]/page.tsx
- **Roles / capabilities:** Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Trip route, stops, disruption impacts, consignments.

## Key components / features
- `TripDetail` (vehicleBase=/gov/fleet/vehicles): Uses `useRoutePlan(current_route_snapshot_id)` to display true curving road geometry and alternative lines on `MapView`.

## Data & API
- GET /api/v1/logistics/trips/{id}, /trips/{id}/impacts, /api/v1/routes/{route_plan_id}

## Behaviour notes
`isUuid` guard. Renders terrain road-following lines.

## Tests
Covered in fleet integration tests.

## Known issues / TODO
- None recorded.
