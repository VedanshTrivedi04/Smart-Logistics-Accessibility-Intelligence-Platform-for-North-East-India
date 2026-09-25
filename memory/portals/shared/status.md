# Shared / Service status

- **Route:** /status
- **Source:** frontend/src/app/(protected)/status/page.tsx
- **Roles / capabilities:** Any signed-in user.
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
API liveness and dependency readiness, polled every 20 s.

## Key components / features
- `ServiceStatusView` in `features/session/AccountView.tsx`.

## Data & API
- GET /health/live, /health/ready

## Behaviour notes
- In development/demo mode (`APP_ENV != "production" or DEMO_MODE`), Redis is optional and reports `standby (dev mode)` rather than failing the readiness probe with 503.
- In production, both PostgreSQL and Redis are strictly required for 200 readiness status.
- `ServiceStatusView` resiliently parses dependency check bodies even if 503 is returned, rendering granular diagnostics for database and Redis.

## Tests
- `backend/tests/integration/test_health.py` (`TestReadinessEndpoint`).

## Known issues / TODO
- None recorded.
