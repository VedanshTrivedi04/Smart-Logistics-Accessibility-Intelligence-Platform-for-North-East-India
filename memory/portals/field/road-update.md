# Field / Road and bridge status

- **Route:** /field/road-update
- **Source:** frontend/src/app/(protected)/field/road-update/page.tsx
- **Roles / capabilities:** Nav `VIEW_ROAD_STATUS`; declaring official status needs `UPDATE_ROAD_STATUS` (ROAD_INSPECTION, DISTRICT_VERIFIER, STATE, EMERGENCY, Platform admin).
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Road segments near the officer on a map; select one to view detail and, if permitted, declare an official status.

## Key components / features
- `RoadUpdate` in `features/field/views.tsx`; `EdgePanel` from `features/network/panels.tsx`.

## Data & API
- GET /api/v1/network/edges (bbox)
- GET /api/v1/network/edges/{id}
- POST /api/v1/network/edges/{id}/status

## Behaviour notes
Server records the status; UI never assumes success before the response.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
