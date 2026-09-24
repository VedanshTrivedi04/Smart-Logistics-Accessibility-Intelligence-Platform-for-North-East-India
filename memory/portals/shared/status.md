# Shared / Service status

- **Route:** /status
- **Source:** frontend/src/app/(protected)/status/page.tsx
- **Roles / capabilities:** Any signed-in user.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
API liveness and dependency readiness, polled every 20 s.

## Key components / features
- `ServiceStatusView`.

## Data & API
- GET /health/live, /health/ready

## Behaviour notes
None beyond the above.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
