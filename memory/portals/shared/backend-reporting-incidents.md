# Shared / Backend: reporting and incidents

- **Last updated:** 2026-09-25

- **Source:** backend/app/modules/reporting/, backend/app/modules/incidents/, migration 004
- **Status:** done

- Reporting: POST/GET /reports, POST /reports/sync (idempotent batch), GET /reports/{id}, POST /reports/{id}/amend (immutable), /triage, /review (atomic verify or reject); media: POST /media/upload-ticket, /media/{id}/confirm, GET /media/{id}/download (presigned).
- Supported ReportType enums: LANDSLIDE, FLOODING, ROAD_DAMAGE, BRIDGE_COLLAPSE, TREE_FALL, WEATHER_HAZARD, SECURITY_INCIDENT, OBSTRUCTION, OTHER.
- Reports store reporter-observed passability: `lane_status` (BOTH_BLOCKED, SINGLE_LANE_OPEN, SHOULDER_ONLY, CLEAR), `passable_classes` (HEAVY_TRUCK, LIGHT_4X4, EMERGENCY_ONLY, NONE; JSONB list) and `life_safety_risk` (bool). Migration `010_report_passability`; accepted by POST /reports, /reports/sync items, /reports/{id}/amend; returned in ReportResponse. Unknown values fail that sync item only. These are observations; they do not change review state or auto-caution policy. `openapi.json` and the frontend `schema.d.ts` were regenerated (they also picked up the previously missing ai and seed-regional-network routes).
- Incidents: GET /incidents, GET /incidents/{id}, POST /incidents/{id}/merge, /resolve (recomputes road edge traversability).
- Tests: `backend/tests/unit/reporting`, `unit/incidents`.
- Media storage is pluggable via `STORAGE_BACKEND` (`s3` default, or `cloudinary`); see [[shared/infra-deploy]]. `POST /media/upload-ticket` returns `upload_url` plus `upload_method` (PUT or POST), `upload_headers` and `upload_fields`; the client follows the method. `confirm_upload` still only marks the media CLEAN (no real scan and no check that the file arrived). The download endpoint returns a signed, expiring URL after the `VIEW_REPORT_MEDIA` check.
