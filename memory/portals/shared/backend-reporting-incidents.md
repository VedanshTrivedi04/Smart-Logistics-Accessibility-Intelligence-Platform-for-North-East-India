# Shared / Backend: reporting and incidents

- **Last updated:** 2026-09-24

- **Source:** backend/app/modules/reporting/, backend/app/modules/incidents/, migration 004
- **Status:** done

- Reporting: POST/GET /reports, POST /reports/sync (idempotent batch), GET /reports/{id}, POST /reports/{id}/amend (immutable), /triage, /review (atomic verify or reject); media: POST /media/upload-ticket, /media/{id}/confirm, GET /media/{id}/download (presigned).
- Incidents: GET /incidents, GET /incidents/{id}, POST /incidents/{id}/merge, /resolve (recomputes road edge traversability).
- Tests: `backend/tests/unit/reporting`, `unit/incidents`.

## AI facade additions (2026-09-25)
- `reporting/public.py` now exports `LocationPoint`, `ReportType`, `ReportSeverity` and `ReportingModulePort.submit_report(...)` / `find_report_by_operation_id(...)` (wraps SubmitFieldReportUseCase; `ReportingModule(repo, incident_repo=None)`), used by `POST /api/v1/ai/voice-report`.
- See `known-issues.md`: reporting routers do not commit (writes are lost).
