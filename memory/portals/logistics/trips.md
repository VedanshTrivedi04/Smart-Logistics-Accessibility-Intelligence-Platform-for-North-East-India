# Logistics / Trips

- **Route:** /logistics/trips
- **Source:** frontend/src/app/(protected)/logistics/trips/page.tsx
- **Roles / capabilities:** Logistics surface: FLEET_MANAGER, DELIVERY_COORDINATOR, TRANSPORT_OPERATOR. Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Trip list by status.

## Key components / features
- `TripList`.

## Data & API
- GET /api/v1/logistics/trips

## Behaviour notes
None beyond the above.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
