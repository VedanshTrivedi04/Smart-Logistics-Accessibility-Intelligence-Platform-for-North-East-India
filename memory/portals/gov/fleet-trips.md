# Gov / Trips

- **Route:** /gov/fleet/trips
- **Source:** frontend/src/app/(protected)/gov/fleet/trips/page.tsx
- **Roles / capabilities:** Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Trip list filtered by status.

## Key components / features
- `TripList` (`features/fleet/TripViews.tsx`).

## Data & API
- GET /api/v1/logistics/trips

## Behaviour notes
None beyond the above.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
