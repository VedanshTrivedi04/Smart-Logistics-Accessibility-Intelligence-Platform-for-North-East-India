# Shared / Backend: reporting and incidents

- **Last updated:** 2026-09-26

- **Source:** backend/app/modules/reporting/, backend/app/modules/incidents/, migration 004
- **Status:** done

- Reporting: POST/GET /reports, POST /reports/sync (idempotent batch), GET /reports/{id}, POST /reports/{id}/amend (immutable), /triage, /review (atomic verify or reject); media: POST /media/upload-ticket, /media/{id}/confirm, GET /media/{id}/download (presigned).
- Supported ReportType enums: LANDSLIDE, FLOODING, ROAD_DAMAGE, BRIDGE_COLLAPSE, TREE_FALL, WEATHER_HAZARD, SECURITY_INCIDENT, OBSTRUCTION, ROAD_CONDITION_UPDATE, OTHER.
- Reports store reporter-observed passability: `lane_status` (BOTH_BLOCKED, SINGLE_LANE_OPEN, SHOULDER_ONLY, CLEAR), `passable_classes` (HEAVY_TRUCK, LIGHT_4X4, EMERGENCY_ONLY, NONE; JSONB list) and `life_safety_risk` (bool) via Migration `010_report_passability`. Migration `011_report_location_altitude_road_side` adds `altitude_m` (Float, nullable) and `road_side` (String(24), nullable: HILLSIDE, VALLEY_SIDE, BOTH, UNKNOWN); accepted by POST /reports, /reports/sync batch items, /reports/{id}/amend; returned in ReportResponse. Unknown values fail that sync item only. These are observations; they do not change review state or auto-caution policy.
- Spatial snapping: on report ingestion without an explicit edge or bridge, backend PostGIS automatically queries `find_candidate_edges` (ST_DWithin 250m on road_edges) and `find_candidate_bridges` (ST_DWithin 50m on bridges) to link candidate IDs.
- Incidents: GET /incidents, GET /incidents/{id}, POST /incidents/{id}/merge, /resolve (recomputes road edge traversability).
- Media storage is pluggable via `STORAGE_BACKEND` (`s3` default, or `cloudinary`); see [[shared/infra-deploy]]. `POST /media/upload-ticket` returns `upload_url` plus `upload_method` (PUT or POST), `upload_headers` and `upload_fields`; the client follows the method. `confirm_upload` marks the media CLEAN after byte validation. The download endpoint returns a signed, expiring URL after the `VIEW_REPORT_MEDIA` check.
- Tests: `backend/tests/unit/reporting`, `unit/incidents`.
- Transactions: `get_db()` never commits, so every write handler must call `await db.commit()` itself. Fixed for reporting (submit, sync, amend, upload-ticket, confirm) and incidents (triage, review, resolve, merge). Guarded by `tests/unit/reporting/test_router_commits.py`.

## AI facade additions (2026-09-25)
- `reporting/public.py` exports `LocationPoint`, `ReportType`, `ReportSeverity` and `ReportingModulePort.submit_report(...)` / `find_report_by_operation_id(...)` (wraps SubmitFieldReportUseCase; `ReportingModule(repo, incident_repo=None)`), used by `POST /api/v1/ai/voice-report`.

## Access control, media validation, commits (2026-09-26)
- **Who sees which report** (`reporting/application/access.py`, deny by default): the reporter always; PLATFORM_ADMINISTRATOR all; everyone else only reports whose jurisdiction is inside their granted jurisdictions (STATE covers its DISTRICTs; a REGION grant also covers unassigned reports); no grant = own reports only. Applied to `GET /reports`, `GET /reports/{id}` (404 when not allowed, owner needs no detail capability), the media download (uploader, or `VIEW_REPORT_MEDIA` plus a visible attached report), and `POST /ai/auto-triage-report` (now `VERIFY_REPORT` + scope). Only the uploader can confirm a media object, and a report can only attach media its author uploaded.
- New reports are tagged with the reporter's most specific granted jurisdiction (`PrincipalContext.home_jurisdiction_id`).
- **Media confirm reads the stored bytes**: size, SHA-256, file signature, format and dimensions (Pillow, `media_inspector.py`) are checked; failures become REJECTED (file deleted, 400 to the client); storage read failures are 503 (retryable). Optional ClamAV via `CLAMAV_HOST` (`clamav_scanner.py`, clamd INSTREAM protocol, unit-tested against a stand-in daemon only). Reports can only attach CLEAN media.
- New report type `ROAD_CONDITION_UPDATE` (observation only; never triggers auto-caution).
- Every write handler in reporting, incidents, logistics, telemetry, impact and AI auto-triage now commits (guarded by `tests/unit/reporting/test_router_commits.py`). `POST /impact/evaluate` now requires `COORDINATE_RESPONSE` (was any login).
- Migrations 010 (passability) and 011 (altitude, road_side; revision id shortened to fit alembic's 32-char column) were applied to the Neon database on 2026-09-26.
