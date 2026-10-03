# Inspector / Proximity & Tactical Map

- **Route:** /inspector/nearby
- **Source:** frontend/src/app/(protected)/inspector/nearby/page.tsx
- **Roles / capabilities:** ROAD_INSPECTION (`VIEW_REPORT_SUMMARY`, `VIEW_ROAD_STATUS`, `CONDUCT_INSPECTION`)
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Location-aware proximity scanner showing incidents, disruptions, road status updates, and nearby inspections within 5km of the inspector's current GPS location.

## Key components / features
- `features/field/views.tsx` (`NearbyView`) - Proximity sorted incident cards, road condition updates, and tactical map centered on live position.

## Data & API
- Geolocation API (`useGeolocation()`).
- GET `/api/v1/reports` and GET `/api/v1/network/edges`.

## Behaviour notes
- Recalculates distances in real-time as the inspector travels along the highway corridor.
- Supports Temporary / Simulated Location Overrides (`useGeolocation`): allows inspectors & testers to 1-click jump to major North-East corridor presets (e.g. Jorabat NH-6/27, NH-6 km 42 Umtrew Bridge, Shillong Bypass, Jagiroad, Sevoke) or enter custom Lat/Lon coordinates with session persistence and 1-click reset to live GPS.

## Tests
- Frontend build validation.

## Known issues / TODO
- None.
