# Field / Profile and assignments

- **Route:** /field/profile
- **Source:** frontend/src/app/(protected)/field/profile/page.tsx
- **Roles / capabilities:** Field surface: FIELD_OFFICER, LOCAL_AUTHORITY, ROAD_INSPECTION.
- **Status:** done
- **Last updated:** 2026-09-26

## Purpose
Officer profile and assigned jurisdictions.

## Key components / features
- `FieldProfile` in `features/field`.

## Data & API
- GET /api/v1/me

## Behaviour notes
None beyond the above.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.

## Update 2026-09-26
- New "Offline readiness" card: whether the field screens are saved for offline use (`offlineReady`) and whether the browser promised to keep storage.
