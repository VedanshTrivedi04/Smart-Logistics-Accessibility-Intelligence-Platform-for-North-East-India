# Gov / Vehicle detail

- **Route:** /gov/fleet/vehicles/[id]
- **Source:** frontend/src/app/(protected)/gov/fleet/vehicles/[id]/page.tsx
- **Roles / capabilities:** Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Vehicle, current trip, GPS and breadcrumb trail.

## Key components / features
- `VehicleDetail`.

## Data & API
- GET /telemetry/vehicles/{id}/position, /breadcrumbs

## Behaviour notes
'Vehicle not found' banner when outside the org.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
