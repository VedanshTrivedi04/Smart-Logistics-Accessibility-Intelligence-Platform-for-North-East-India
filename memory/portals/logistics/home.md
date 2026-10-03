# Logistics / Fleet Operations Command

- **Route:** /logistics
- **Source:** frontend/src/app/(protected)/logistics/page.tsx
- **Roles / capabilities:** `VIEW_FLEET` (Fleet Manager, Delivery Coordinator, Transport Operator). Falls back gracefully to `LogisticsOverview` without `VIEW_FLEET`.
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Primary operational cockpit for Fleet Operations (Hema Goswami): real-time vehicle & driver KPIs, active trip statuses, telemetry freshness alerts, needs-attention disruption notices, and quick-action links.

## Key components / features
- `features/fleet/FleetHome.tsx` – High-density operational stats across 4 desks: Deliveries & Consignments, Vehicles Overview, Drivers Roster, and Active Logistics Trips; needs-attention alert feed, 6-card quick access matrix (Deliveries, Vehicles, Drivers, Trips, Assignments, Disruptions), active trips summary, vehicle status breakdown.

## Data & API
- GET /api/v1/logistics/vehicles
- GET /api/v1/logistics/drivers
- GET /api/v1/logistics/trips
- GET /api/v1/logistics/commitments
- GET /api/v1/telemetry/vehicles/{id}/position

## Behaviour notes
Figures are scoped strictly to the user's organization (`principal.org_id`). Honors telemetry staleness (> 3 min lag warnings) and highlights road network disruptions affecting active trips.

## Tests
- Verified via clean TypeScript compilation and end-to-end integration tests.

## Known issues / TODO
- None.
