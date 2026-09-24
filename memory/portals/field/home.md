# Field / Home

- **Route:** /field
- **Source:** frontend/src/app/(protected)/field/page.tsx
- **Roles / capabilities:** Field surface: FIELD_OFFICER, LOCAL_AUTHORITY, ROAD_INSPECTION.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Field landing: current location, assignment, notices for the officer, manual 'Sync now'.

## Key components / features
- `FieldHome` in `features/field/views.tsx` (location card, Assignment card, Notices card).

## Data & API
- Cached identity (`shared/offline`) plus GET /api/v1/me; sync via offline engine.

## Behaviour notes
Works offline; location is read on demand via `useGeolocation`.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
