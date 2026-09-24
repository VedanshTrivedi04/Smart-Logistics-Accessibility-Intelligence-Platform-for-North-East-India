# Shared / Backend: telemetry

- **Last updated:** 2026-09-24

- **Source:** backend/app/modules/telemetry/, migration 005
- **Status:** done

- POST /telemetry/devices, /telemetry/ingest (batch), /telemetry/simulator/replay; GET /telemetry/vehicles/{id}/position, /breadcrumbs. Position carries stale_status. Redis is used for real-time state.
- Tests: `backend/tests/unit/telemetry`.
