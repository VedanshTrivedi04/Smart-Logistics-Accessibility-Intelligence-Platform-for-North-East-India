# Logistics / Drivers Roster

- **Route:** /logistics/drivers
- **Source:** frontend/src/app/(protected)/logistics/drivers/page.tsx
- **Roles / capabilities:** `VIEW_FLEET`
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Roster management for transport operators and drivers: availability, current trip assignments, licensing, and PII protection.

## Key components / features
- `features/fleet/DriversView.tsx` – Filter tabs (All, Available, On Active Trip, Inactive), search, active trip and vehicle links, collapsible `CreateDriverForm`.

## Data & API
- GET /api/v1/logistics/drivers
- GET /api/v1/logistics/trips
- GET /api/v1/logistics/vehicles
- POST /api/v1/logistics/drivers

## Behaviour notes
Driver phone numbers and personal identifiers are PII-masked unless the user holds `VIEW_DRIVER_PII`. Clicking a driver opens their dossier (`/logistics/drivers/[id]`).

## Tests
- `tests/integration/logistics/test_fleet_dispatch.py` (driver registration and PII redaction).
