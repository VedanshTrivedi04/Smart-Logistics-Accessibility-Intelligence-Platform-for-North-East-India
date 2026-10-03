# Logistics / Disruption Intelligence & Coordination

- **Route:** /logistics/disruptions
- **Source:** frontend/src/app/(protected)/logistics/disruptions/page.tsx
- **Roles / capabilities:** `VIEW_IMPACT` (Fleet Manager). Directive recording requires `COORDINATE_RESPONSE`.
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Monitors operational disruption impacts on active fleet trips caused by authoritative road closures, landslides, and infrastructure damage from Field & Inspector portals.

## Key components / features
- `features/fleet/DisruptionsBoard.tsx` – Active disrupted trips table, severity badges, delay estimates, distance to disruption, `RiskExplainerDrawer` integration for corridor risk breakdown, and `TripCoordinationDialog` for logging driver operational directives.

## Data & API
- GET /api/v1/edges/{edge_id}/impacts
- GET /api/v1/trips/{trip_id}/impacts
- GET /api/v1/coordination/summaries?subject_type=TRIP
- POST /api/v1/coordination/actions

## Behaviour notes
Fleet Ops does not alter road network states directly; road truth is strictly verified by Field Operators and Road Inspectors. Fleet Ops assesses downstream impact on active trips and logs coordination instructions for drivers.

## Tests
- `tests/integration/impact/test_edge_impacts.py` (edge-indexed impacts and capability gates).
