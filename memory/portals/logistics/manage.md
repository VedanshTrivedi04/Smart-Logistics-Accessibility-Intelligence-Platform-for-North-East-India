# Logistics / Fleet management

- **Route:** /logistics/manage
- **Source:** frontend/src/app/(protected)/logistics/manage/page.tsx
- **Roles / capabilities:** Logistics surface: FLEET_MANAGER, DELIVERY_COORDINATOR, TRANSPORT_OPERATOR. Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Register vehicles and drivers, record consignments, plan trips.

## Key components / features
- `FleetManagement`, `DriverList` (`features/fleet/forms.tsx`).

## Data & API
- POST/GET /api/v1/logistics/vehicles, drivers, commitments, trips

## Behaviour notes
Success banners only after the server responds. Driver PII needs `VIEW_DRIVER_PII`.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
