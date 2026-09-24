# Logistics / Trip detail

- **Route:** /logistics/trips/[id]
- **Source:** frontend/src/app/(protected)/logistics/trips/[id]/page.tsx
- **Roles / capabilities:** Logistics surface: FLEET_MANAGER, DELIVERY_COORDINATOR, TRANSPORT_OPERATOR. Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Trip map, stops, impacts, consignments, status transitions.

## Key components / features
- `TripDetail` (vehicleBase=/logistics/vehicles).

## Data & API
- GET /logistics/trips/{id}; POST /logistics/trips/{id}/transition; GET /trips/{id}/impacts

## Behaviour notes
None beyond the above.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
