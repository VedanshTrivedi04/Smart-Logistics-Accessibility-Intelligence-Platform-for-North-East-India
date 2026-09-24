# Logistics / Deliveries

- **Route:** /logistics/deliveries
- **Source:** frontend/src/app/(protected)/logistics/deliveries/page.tsx
- **Roles / capabilities:** Logistics surface: FLEET_MANAGER, DELIVERY_COORDINATOR, TRANSPORT_OPERATOR. Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Consignments ordered by priority then deadline.

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
