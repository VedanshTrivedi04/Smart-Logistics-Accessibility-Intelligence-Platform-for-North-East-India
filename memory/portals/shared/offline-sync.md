# Shared / Offline-first storage and sync

- **Last updated:** 2026-09-24

- **Source:** frontend/src/shared/offline/*, features/field/{store,model,OfflineProvider}.ts(x), features/field/sync/{engine,media,transport}.ts, app/ServiceWorkerRegister.tsx
- **Status:** done

## Model
- IndexedDB (`idb`) database `ner-field`, schema version 1. Records: drafts (`DraftRecord`: id, ownerId, orgId, kind REPORT, payload, step) and operations (`OperationRecord`, stable id sent as `client_operation_id` so the server deduplicates).
- `queue-state.ts` holds the operation state machine; `events.ts` broadcasts changes; `storage.ts` reports quota/usage.
- Sync engine batches to POST /api/v1/reports/sync; media go through presigned upload ticket then confirm.
- Records are owner/org scoped; the queue page warns when another account left unsent reports on the device.
- Identity is cached so the field surface can render offline.

## Rules to keep
- 'Saved on device' must never be presented as submitted.
- Do not store tokens in IndexedDB.

## Tests
`tests/unit/offline-db.test.ts`, `queue-state.test.ts`, `sync-engine.test.ts`; e2e `offline-report-journey.spec.ts`.
