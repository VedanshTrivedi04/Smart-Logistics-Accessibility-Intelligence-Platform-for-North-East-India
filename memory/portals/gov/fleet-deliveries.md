# Gov / Deliveries

- **Route:** /gov/fleet/deliveries
- **Source:** frontend/src/app/(protected)/gov/fleet/deliveries/page.tsx
- **Roles / capabilities:** Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Consignments by priority then deadline.

## Key components / features
- `CommitmentList`.

## Data & API
- GET /api/v1/logistics/commitments

## Behaviour notes
None beyond the above.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
