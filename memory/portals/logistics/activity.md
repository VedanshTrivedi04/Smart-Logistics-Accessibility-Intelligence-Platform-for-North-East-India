# Logistics / Operational Activity & Audit Log

- **Route:** /logistics/activity
- **Source:** frontend/src/app/(protected)/logistics/activity/page.tsx
- **Roles / capabilities:** `VIEW_FLEET`
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Audit feed of all recent fleet dispatches, status transitions, driver coordination directives, and consignment orders.

## Key components / features
- `features/fleet/FleetActivityView.tsx` – Category filtering (All, Trips, Directives, Consignments), timestamped event stream with direct links to trip monitors.

## Data & API
- GET /api/v1/logistics/trips
- GET /api/v1/logistics/commitments
- GET /api/v1/coordination/summaries

## Behaviour notes
Sorted chronologically newest first. Provides accountability and operational traceability across dispatch and incident coordination actions.

## Tests
- TypeScript type-check and integrated query tests.
