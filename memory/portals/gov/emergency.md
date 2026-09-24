# Gov / Emergency operations

- **Route:** /gov/emergency
- **Source:** frontend/src/app/(protected)/gov/emergency/page.tsx
- **Roles / capabilities:** Guard `RESPOND_EMERGENCY` (EMERGENCY_COORDINATOR).
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Priority-first board: critical incidents, blocked roads, severe risk zones, isolated facilities, late life-saving deliveries, emergency notices, route planner.

## Key components / features
- `features/overview/EmergencyBoard.tsx` (emergency-mode toggle is presentation only).

## Data & API
- incidents, edges, facilities, risk-zones, impacts, fleet.

## Behaviour notes
Emergency mode grants no permissions and changes no road status.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
