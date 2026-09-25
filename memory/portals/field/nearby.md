# Field / Nearby and alerts

- **Route:** /field/nearby
- **Source:** frontend/src/app/(protected)/field/nearby/page.tsx
- **Roles / capabilities:** Field surface: FIELD_OFFICER, LOCAL_AUTHORITY, ROAD_INSPECTION.
- **Status:** done
- **Last updated:** 2026-09-26

## Purpose
Reports and road status near the officer within the assigned area, plus alerts.

## Key components / features
- `NearbyView` in `features/field/views.tsx` using `shared/map`.

## Data & API
- GET /api/v1/reports, /network/edges

## Behaviour notes
Distances require a location fix; banner prompts to update location.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.

## Update 2026-09-26
- Reports, incidents and nearby road segments use offline snapshots; a warning banner shows when the screen is using saved data. Reports are now scoped by the server (own reports plus reports inside the user's jurisdiction).
- Tactical Highway Position HUD: computes `snapToCorridor(fix.latitude, fix.longitude)` showing formatted chainage (e.g. `NH-6 · KM 21.5`), milestone name (`Jorabat Strategic Fork`), and lateral offset from road centerline.
- Distance-sorted nearby hazards card: categorizes hazards into critical (red) and warnings (amber), distance from officer (`4.2 km away`), and direct dossier navigation links.
- Two-way government advisory feed: distinct section for regional advisories and broadcast weather alerts issued by MDoNER Command and District Emergency Operations.
