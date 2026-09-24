# Gov / Field Reports & Ground Intelligence Dossier

- **Route:** /gov/reports
- **Source:** frontend/src/app/(protected)/gov/reports/page.tsx
- **Roles / capabilities:** Guard `VIEW_REPORT_SUMMARY`; `VIEW_REPORT_DETAIL`, `VIEW_REPORT_MEDIA` for forensic images; `VERIFY_REPORT` for District Verifier adjudication desk.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Unified command feed and ground intelligence dossier for field patrol observations across North-East India (damage assessment, landslides, bridge scours, flooding, weather obstructions). Provides forensic telemetry, sensor accuracy, photo evidence lightbox, and bidirectional linkage with operational incidents.

## Key components / features
- `features/incidents/ReportsCommandCenter.tsx`:
  - Analytical KPI metrics bar (Total, Awaiting Review, Under Review, Verified, More Info, Rejected).
  - Search and filter pills by lifecycle review state and hazard severity.
  - Master observation list displaying `#FR-XXXX`, relative timestamps, corridor badges, and photo indicators.
  - Right-hand Ground Intelligence Dossier: Officer attribution, GNSS coordinates, sensor provider (`GPS_HARDWARE`), elevation, and accuracy radius (no map, rich textual topography).
  - Ground Evidence Gallery with secure presigned S3 media URLs (`useMediaUrl`) and interactive high-resolution Lightbox modal with anti-malware verification status.
  - Stepped progression pipeline (`SUBMITTED` → `UNDER REVIEW` → `VERIFIED` / `REJECTED` / `MORE_INFO_NEEDED`).
  - Cross-linkage to `/gov/incidents?selected={incident_id}` when an observation is verified into an active incident.
  - Strict RBAC: Regional Commander has read-only monitoring oversight; adjudication actions (`VERIFY_REPORT`) are gated to authorized District Verifiers.

## Data & API
- GET `/api/v1/reports` (via `useReports()`)
- GET `/api/v1/reports/{report_id}` (via `useReport()`)
- GET `/api/v1/incidents` (via `useIncidents()` for cross-incident linkage)
- GET `/api/v1/media/{media_id}/download` (via `useMediaUrl()` for signed time-bounded URLs)
- POST `/api/v1/reports/{report_id}/triage` (via `useTriage()`)
- POST `/api/v1/reports/{report_id}/review` (via `useReview()`)

## Behaviour notes
- 100% dynamic and connected to backend PostgreSQL/PostGIS database; no mock or hardcoded reports.
- Handles `?selected={report_id}` query parameter to immediately focus on linked reports from the Incident Command Center.
- No embedded maps per design directive to avoid clutter; relies on detailed corridor, milestone, and GNSS coordinate data.

## Tests
- `tests/unit/components/reports.test.tsx` (generic report tests)

## Known issues / TODO
- None recorded.
