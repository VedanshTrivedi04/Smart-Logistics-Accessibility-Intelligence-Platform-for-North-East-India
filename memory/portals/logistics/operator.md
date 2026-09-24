# Logistics / Driver & Operator Cockpit

- **Route:** /logistics/operator
- **Source:** frontend/src/app/(protected)/logistics/operator/page.tsx
- **Roles / capabilities:** Logistics surface: FLEET_MANAGER, DELIVERY_COORDINATOR, TRANSPORT_OPERATOR. Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Driver view: assigned vehicle and active mission, GPS fix, corridor hazards, one-touch actions (start, deliver, emergency broadcast), scheduled checkpoints.

## Key components / features
- `features/fleet/OperatorView.tsx` (438 lines), `gps.ts`.

## Data & API
- POST /api/v1/logistics/trips/{id}/transition; POST /telemetry/ingest (GPS); hazard risk-zones.

## Behaviour notes
Confirmation step before completing a delivery. Emergency broadcast banner.

## Tests
No page-specific test.

## Known issues / TODO
- TRANSPORT_OPERATOR baseline has `SUBMIT_GPS` but not `VIEW_FLEET`; confirm the operator role is granted fleet visibility, otherwise the Guard blocks this page.
