# Logistics / Live fleet map

- **Route:** /logistics/fleet
- **Source:** frontend/src/app/(protected)/logistics/fleet/page.tsx
- **Roles / capabilities:** Logistics surface: FLEET_MANAGER, DELIVERY_COORDINATOR, TRANSPORT_OPERATOR. Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Where each vehicle was last heard from, and how old that is.

## Key components / features
- `FleetMap` with /logistics/* bases.

## Data & API
- vehicles + telemetry positions

## Behaviour notes
None beyond the above.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
