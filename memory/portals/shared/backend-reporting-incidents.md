# Shared / Backend: reporting and incidents

- **Last updated:** 2026-09-24

- **Source:** backend/app/modules/reporting/, backend/app/modules/incidents/, migration 004
- **Status:** done

- Reporting: POST/GET /reports, POST /reports/sync (idempotent batch), GET /reports/{id}, POST /reports/{id}/amend (immutable), /triage, /review (atomic verify or reject); media: POST /media/upload-ticket, /media/{id}/confirm, GET /media/{id}/download (presigned).
- Incidents: GET /incidents, GET /incidents/{id}, POST /incidents/{id}/merge, /resolve (recomputes road edge traversability).
- Tests: `backend/tests/unit/reporting`, `unit/incidents`.
