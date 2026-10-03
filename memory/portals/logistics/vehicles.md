# Logistics / Vehicles Directory

- **Route:** /logistics/vehicles
- **Source:** frontend/src/app/(protected)/logistics/vehicles/page.tsx
- **Roles / capabilities:** `VIEW_FLEET`
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Comprehensive inventory and operational status desk for all organization-owned vehicles.

## Key components / features
- `features/fleet/VehiclesView.tsx` – Filter tabs (All, Available, On Trip, Maintenance, Offline Telemetry), search, specs, active trip cross-referencing, collapsible `CreateVehicleForm`.

## Data & API
- GET /api/v1/logistics/vehicles
- GET /api/v1/logistics/trips
- GET /api/v1/logistics/drivers
- GET /api/v1/telemetry/vehicles/{id}/position
- POST /api/v1/logistics/vehicles

## Behaviour notes
Combines vehicle specs with live trip state and GPS fix status. Clicking a vehicle opens the tabbed detail dossier (`/logistics/vehicles/[id]`).

## Tests
- `tests/integration/logistics/test_fleet_dispatch.py` (vehicle registration and listing).

## Known issues / TODO
- Vehicle maintenance entity is placeholder-only; full maintenance logging deferred to future sprint.
