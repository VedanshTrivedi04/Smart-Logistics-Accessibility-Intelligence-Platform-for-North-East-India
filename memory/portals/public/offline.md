# Public / Offline fallback

- **Route:** /offline
- **Source:** frontend/src/app/offline/page.tsx
- **Roles / capabilities:** Anyone.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Service-worker fallback shown when a page is not cached and there is no connection.

## Key components / features
- Static page 'You are offline'; notes that live maps, others' reports and vehicle positions need a connection.

## Data & API
None.

## Behaviour notes
Registered through `ServiceWorkerRegister.tsx`. Field draft/queue pages work offline via IndexedDB (see [[shared/offline-sync]]).

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
