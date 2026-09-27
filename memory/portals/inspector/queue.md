# Inspector / Field Sync Queue

- **Route:** /inspector/queue
- **Source:** frontend/src/app/(protected)/inspector/queue/page.tsx
- **Roles / capabilities:** ROAD_INSPECTION (`CONDUCT_INSPECTION`)
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Inspection sync queue monitoring local IndexedDB stored operations, pending photo uploads, offline sync status, and storage quotas while operating in low/no connectivity mountain gorges.

## Key components / features
- `features/field/SyncQueue.tsx` - Reused sync queue showing queued inspection updates, retry counts, media status, and manual sync controls.
- `StorageStatusPanel` - Local device storage usage and persistence permissions.

## Data & API
- IndexedDB `ner-field` store: operations, media, drafts.

## Behaviour notes
- Operations queued while offline sync automatically once connectivity is restored via the service worker or user trigger.

## Tests
- Frontend build validation.

## Known issues / TODO
- None.
