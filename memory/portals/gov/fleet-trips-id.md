# Gov / Trip detail

- **Route:** /gov/fleet/trips/[id]
- **Source:** frontend/src/app/(protected)/gov/fleet/trips/[id]/page.tsx
- **Roles / capabilities:** Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Trip route, stops, disruption impacts, consignments.

## Key components / features
- `TripDetail` (vehicleBase=/gov/fleet/vehicles).

## Data & API
- GET /api/v1/logistics/trips/{id}, /trips/{id}/impacts

## Behaviour notes
`isUuid` guard.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
