# Logistics / Driver Dossier

- **Route:** /logistics/drivers/[id]
- **Source:** frontend/src/app/(protected)/logistics/drivers/[id]/page.tsx
- **Roles / capabilities:** `VIEW_FLEET`
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Detailed driver profile, current active trip telemetry, vehicle match, and historical trip log.

## Key components / features
- `features/fleet/DriverDetail.tsx` – 3-tab layout:
  - Tab 1: Dossier Overview (license classes, phone, active vehicle link)
  - Tab 2: Current Trip (live trip status, destination, stops)
  - Tab 3: Assignment & Trip History (all completed and past trips)

## Data & API
- GET /api/v1/logistics/drivers
- GET /api/v1/logistics/trips
- GET /api/v1/logistics/vehicles

## Behaviour notes
Phone numbers are protected via capability `VIEW_DRIVER_PII`. Shows empty state when no active trip is assigned.

## Tests
- `tests/integration/logistics/test_fleet_dispatch.py`
