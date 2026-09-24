# Logistics / Vehicle detail

- **Route:** /logistics/vehicles/[id]
- **Source:** frontend/src/app/(protected)/logistics/vehicles/[id]/page.tsx
- **Roles / capabilities:** Logistics surface: FLEET_MANAGER, DELIVERY_COORDINATOR, TRANSPORT_OPERATOR. Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Vehicle detail with GPS trail.

## Key components / features
- `VehicleDetail`.

## Data & API
- telemetry position/breadcrumbs

## Behaviour notes
None beyond the above.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
