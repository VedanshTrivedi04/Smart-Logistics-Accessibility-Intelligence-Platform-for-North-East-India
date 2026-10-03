# Inspector / Technical Inspection Dossier

- **Route:** /inspector/inspections/[id]
- **Source:** frontend/src/app/(protected)/inspector/inspections/[id]/page.tsx
- **Roles / capabilities:** ROAD_INSPECTION (`CONDUCT_INSPECTION`, `VERIFY_REPORT`, `UPDATE_ROAD_STATUS`)
- **Status:** done
- **Last updated:** 2026-09-27 (fix pass)

## Purpose
Comprehensive on-site technical inspection workstation. Allows the Senior Road Inspector to verify the field patrol report, compare device GPS distance to incident coordinates, review photos, log hazard-specific engineering measurements, attach categorized photographic evidence, and submit authoritative clearance or blockage decisions.

## Key components / features
- `features/inspection/InspectionDossierView.tsx`:
  - Location Verification & Milestones: Multi-tier fallback target resolution (patrol report GPS -> corridor milestone parser e.g. NH-6 km 42 Umtrew Bridge -> corridor sector default -> live GPS snap).
  - Tactical Corridor Map & Radar Sonar Animation: Centered on target bounding box with an expanding dual-frequency concentric sonar pulse (`@keyframes radarWave`) for hazard sites, and a distinct glowing electric blue concentric beacon ping (`@keyframes inspectorBeacon`) for the inspector marker (`kind="self"`). Interactive map click re-pinning, camera focus controls (`🎯 Hazard`, `🔬 Inspector`, `📐 Both`), mode switcher (`📍 On-Site Simulated Fix (~85m)` vs `🛰️ Real Device GPS`), and approach vector line (`MapLine`). MapView `maxBounds` expanded to `[84.0, 19.5]` to avoid clipping West Bengal / transit corridors.
  - Incident-type conditional engineering assessment form (Landslide debris depth & slope movement; Flood water depth over road; Bridge pier scour depth & structural stability).
  - Categorized evidence upload panel: WIDE_ANGLE, CLOSEUP, BRIDGE_PIER, ROAD_SURFACE, SLOPE_FAILURE, WATER_LEVEL with GPS coordinates and bearing azimuth. **Real upload** (fixed 2026-09-27): "Capture / Upload Photo" opens a hidden `<input type=file capture=environment>`; `handleFileSelected` runs the actual field upload pipeline (`prepareImage` -> `sha256Hex` -> `httpTransport.requestUploadTicket` -> `putObject` -> `confirmUpload`) and only then attaches the real `media_id` as evidence. Previously this button (`handleAddMockPhoto`) fabricated a random UUID that was never uploaded anywhere, which the backend would either silently accept (pre-fix) or FK-violate on (mid-fix) — see [[backend-inspection]].
  - Authoritative decision bar: `Confirm & Block Road`, `Declare Clearance Restored (Open)`, `Impassable / Severe Hazard`, `Request Re-inspection`, **`Request More Information`** (added 2026-09-27, routes to `MORE_INFO_NEEDED`), `Reject Report` (now with a selectable rejection-reason `<select>` covering all `RejectionReason` enum values, instead of a hardcoded `"UNVERIFIABLE"` constant).

## Data & API
- GET `/api/v1/inspections/{id}` - loads inspection entity, assessment payload, and tagged evidence. Access is scoped: 403/404-shaped as "not found" if you are neither the assigned inspector nor a supervisor (`ASSIGN_INSPECTION`/`COORDINATE_RESPONSE`).
- POST `/api/v1/inspections/{id}/start` - transitions mission to IN_PROGRESS and claims linked field report to UNDER_REVIEW.
- POST `/api/v1/inspections/{id}/assessment` - saves technical assessment measurements and evidence objects; each evidence `media_id` is server-validated (exists, uploaded by you, `scan_status=CLEAN`) before insert.
- POST `/api/v1/inspections/{id}/decide` - executes authoritative verification, updates edge traversability via the shared `DeclareEdgeStatusUseCase` outbox-notifier pattern, and (for `MORE_INFO_NEEDED`) calls `VerifyReportUseCase` with `REQUEST_MORE_INFO`.

## Behaviour notes
- Decision is strictly scoped to the assigned inspector or a supervisor (fixed 2026-09-27 — previously any `ROAD_INSPECTION` holder could decide anyone's inspection because the bypass check used the baseline `VERIFY_REPORT` capability; see [[backend-inspection]]).
- Copy corrected: the decision panel no longer claims it "triggers immediate impact engine recalculation... and official government incident notifications" — it now says the change does not notify anyone by itself and the Government Portal reflects it on its next refresh, matching what the outbox/dispatcher actually does.

## Tests
- Unit: `backend/tests/unit/inspection/test_inspection_lifecycle.py` (includes `TestAssignmentScoping`, `TestEvidenceMediaValidation`, `TestMoreInfoDecision`, added 2026-09-27).
- Integration: `backend/tests/integration/inspection/test_inspection_api.py` (fake-evidence-rejected, real-evidence-accepted, real `/decide` end-to-end, 403 for a role with no inspection capability).

## Known issues / TODO
- None outstanding from the 2026-09-27 review/fix pass.
