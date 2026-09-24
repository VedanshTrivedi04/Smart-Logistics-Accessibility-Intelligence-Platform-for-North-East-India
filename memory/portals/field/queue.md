# Field / Send queue

- **Route:** /field/queue
- **Source:** frontend/src/app/(protected)/field/queue/page.tsx
- **Roles / capabilities:** Field surface: FIELD_OFFICER, LOCAL_AUTHORITY, ROAD_INSPECTION.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Everything saved on this device and what happens next: drafts, unsent/failed reports, storage usage, warning if another account has unsent reports on the device.

## Key components / features
- `features/field/SyncQueue.tsx` (`SyncQueue`, `StorageStatusPanel`), `OfflineProvider.tsx`.

## Data & API
- Sync engine calling /api/v1/reports/sync and media endpoints.

## Behaviour notes
State machine in `shared/offline/queue-state.ts`. Error shown if offline storage is unavailable.

## Tests
`queue-state.test.ts`, `sync-engine.test.ts`.

## Known issues / TODO
- None recorded.
