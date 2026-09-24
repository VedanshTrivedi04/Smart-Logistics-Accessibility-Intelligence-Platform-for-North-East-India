# Public / Landing page (/)

- **Route:** /
- **Source:** frontend/src/app/page.tsx
- **Roles / capabilities:** Anyone (no login). Signed-in users are offered their surface home via `SURFACE_HOME`.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Landing page for the PARVA NER platform: explains stakeholders (government, field, logistics) and links to sign-in and the public route checker.

## Key components / features
- Large static page (~627 lines) using lucide icons; uses `useSession` and `SURFACE_HOME` to show the right CTA.

## Data & API
None (static + session read).

## Behaviour notes
Role-based access is described here but enforced by the backend, not this page.

## Tests
No page-specific test.

## Known issues / TODO
- Pre-existing lint errors in this file (memory.md 2026-09-24).
