# Shared / Offline-first storage and sync

- **Last updated:** 2026-09-26

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

## Offline shell (service worker `public/sw.js`, version v3, production builds only)
- After a verified sign-in, `FieldOfflineProvider` posts `warm-field-shell`; the worker fetches the 7 field screens plus every `/_next/static` asset named in their HTML (paths contain `(protected)`, so the regex must allow parentheses) and writes the marker `/__field-shell-ready`. The provider exposes `offlineReady`; `/field/profile` shows it. The map code is lazy, so `preloadMap()` fetches it while online.
- Cached pages are keyed by path (query string ignored) so `?type=` and `?draft=` links work offline. The worker still never caches `/api` or `/health`.
- `MapViewLazy` shows a notice instead of crashing the screen if the map chunk cannot load.
- Verified in a real Chromium (desktop and Pixel 5 profiles) against a production build: offline wizard -> save -> reload -> queue -> reconnect -> sync exactly once.

## Last-known data (`shared/offline/snapshots.ts`, `features/field/useOfflineSnapshot.ts`)
- Reports, incidents, corridor road status and hazard zones are saved per user in the existing `sync_metadata` store (no schema change) and shown when the server cannot be reached, with a `StaleDataBanner` ("as of ..."). Removed on sign-out (`clearSnapshots()` in `shared/auth/session.tsx`). Not encrypted.

## Road condition and SMS
- `features/field/roadCondition.ts` + `RoadConditionForm.tsx`: an officer reports a segment's condition (open / restricted / blocked) as a `ROAD_CONDITION_UPDATE` report through the same offline queue. It is an observation; a verifier decides.
- `features/field/sms.ts`: "Send by SMS" link in the send queue (needs `NEXT_PUBLIC_FIELD_SMS_NUMBER`). Opens the SMS app with a <=160 char ASCII text. Nothing ingests SMS automatically; a report is never marked sent because of it.

## Not done
- Local data is not encrypted (IndexedDB). A PIN-based scheme would need sync to run only while unlocked; not built.
- The government portal has no offline mode.
