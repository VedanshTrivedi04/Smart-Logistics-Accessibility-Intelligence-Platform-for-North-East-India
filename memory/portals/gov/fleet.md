# Gov / Vehicles (fleet map)

- **Route:** /gov/fleet
- **Source:** frontend/src/app/(protected)/gov/fleet/page.tsx
- **Roles / capabilities:** Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Last reported GPS positions of vehicles visible to the org.

## Key components / features
- `FleetMap` with bases /gov/fleet/vehicles, /gov/fleet/trips, /gov/routes. Feature code lives in `features/fleet` (see [[shared/features-fleet]]).

## Data & API
- GET /api/v1/logistics/vehicles, /telemetry/vehicles/{id}/position

## Behaviour notes
Positions are observations; stale status is shown (STALE_WARNING, FEED_OFFLINE).

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
