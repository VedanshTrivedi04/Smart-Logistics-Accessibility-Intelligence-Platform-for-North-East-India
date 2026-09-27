# Logistics / Vehicle Detail

- **Route:** /logistics/vehicles/[id]
- **Source:** frontend/src/app/(protected)/logistics/vehicles/[id]/page.tsx
- **Roles / capabilities:** `VIEW_FLEET`
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
In-depth vehicle telemetry, active assignments, trip itinerary, maintenance state, and historical runs.

## Key components / features
- `features/fleet/VehicleDetail.tsx` – 5-tab interface:
  - Tab 1: Overview (specs, dimensions, tare, tare/max payload capacity)
  - Tab 2: Trips (all trips executed by this vehicle)
  - Tab 3: Telemetry (live speed, GPS coords, fix quality, breadcrumbs)
  - Tab 4: Maintenance (operational status, inspection interval placeholder)
  - Tab 5: History (`DeliveryHistory` filtered by `vehicleId`)

## Data & API
- GET /api/v1/logistics/vehicles
- GET /api/v1/telemetry/vehicles/{id}/position
- GET /api/v1/telemetry/vehicles/{id}/breadcrumbs
- GET /api/v1/logistics/trips

## Behaviour notes
Displays honest "No GPS Fix" when never reported. Breadcrumb history updates dynamically based on lookback selector (1h to 24h).

## Tests
- `tests/integration/logistics/test_fleet_dispatch.py`
