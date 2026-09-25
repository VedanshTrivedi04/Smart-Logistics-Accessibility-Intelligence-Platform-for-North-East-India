# AI/ML integration plan: backend ↔ frontend ↔ demo

**Status:** proposal, not yet approved · **Date:** 2026-09-25 · **Owner:** AI/ML track
**Audience:** the whole team. Section 2 lists decisions we need from you before work starts.

## 1. Where things stand

The AI module (`backend/app/modules/ai/`) is built and tested on a local PostGIS stack: 538 of 539 pytest tests pass (the one failure, `test_role_capabilities[DISTRICT_VERIFIER]`, is an identity test/code mismatch unrelated to AI) and the HTTP end-to-end scripts in `backend/tests/e2e/` pass 69/69 (they need the local stack described there, with a database separate from the pytest one). Frontend: another session has already added AI screens in the working tree (uncommitted: `features/ai/` hooks, `VoiceReportSection`, `PhotoHazardPreview`, `AiVisualTriageDossier`, `DynamicEtaCard`, `RiskExplainerDrawer`, `DispatchOptimizer`). The AI track has **not** verified them against the current API (e.g. the photo screen mentions bounding boxes, which `/ai/verify-photo` does not return). Model artifacts are git-ignored. **Neon already contains the AI schema** (verified read-only on 2026-09-25: alembic version `011_report_altitude_road_side`, tables `edge_terrain_features`/`edge_weather_features`/`landslide_events` and `reports.cv_*` present), applied through the ORIGINAL revision ids `007_ai_feature_store` → `008_reporting_cv_verification` → `009_merge_cv_verification`.

| Capability | Endpoint | Backed by | What it really is |
|---|---|---|---|
| Edge disruption risk (+ SHAP factors) | `POST /ai/predict-risk` | XGBoost, calibrated | Trained on 446 real landslide events (NASA GLC + COOLR) with open weather/terrain features. Spatial-CV ROC-AUC ≈ 0.77. Background points are *unverified*, so this is **not** a validated accuracy figure. Probabilities are calibrated to an *assumed* 5 % prevalence; decisions use the raw score. |
| Photo hazard check | `POST /ai/verify-photo`, `POST /ai/auto-triage-report` | YOLOv8m (ONNX) | Trained on real landslide photos. Recognises **only** `LANDSLIDE`. Test split (54 landslide + 45 clear images): precision 0.91, recall 0.98, 11 % false alarms; box localisation is weak. Advisory only; never asserts "road clear". |
| Route ETA | `POST /ai/estimate-eta` | CatBoost | **Synthetic, NE-calibrated** (`SYNTHETIC_NE_CALIBRATED`): 44 real NE corridors (OSM geometry, 5,483 km), SRTM terrain, real sampled rainfall, physics labels whose 2 free parameters are fitted to 4 published typical car times. On corridors held out of training its route totals are unbiased (route MAPE 12.6 % against the synthetic labels); on the 4 anchor corridors (held out) it is within 9–25 % of the published times (old synthetic model 21–37 % too fast, raw OSRM 55 % too fast). None of this is accuracy against real trips. Must be labelled as synthetic in the UI. |
| Dispatch optimisation | `POST /ai/optimize-dispatch` | OR-Tools (no training) | Works on real facilities/vehicles/commitments. Ignores `required_before` deadlines and per-edge risk penalties for now. |
| Voice → report | `POST /ai/voice-report`, `POST /ai/transcribe-voice` | Bhashini ASR + translation | Live-verified. ASR only for Hindi, Bengali, English (+ other major languages). |
| Typed text → report | `POST /ai/text-report`, `POST /ai/translate-text` | Bhashini translation | For Assamese, Manipuri, Bodo, Nepali (no ASR exists for them). Khasi/Mizo/Garo are not supported by Bhashini at all. |

Safety rules already enforced server-side for voice/text reports: severity is never inferred (defaults to MEDIUM and is flagged), report type may be suggested from keywords (flagged), HIGH/CRITICAL requires an explicit type (so a mis-heard keyword cannot trigger Policy 21), reports always enter human review, and empty/unsupported input creates nothing.

## 2. Decisions needed from the team

| # | Decision | Recommendation |
|---|---|---|
| D1 | Where does the demo run: a laptop with the local Docker stack, or a hosted stack on Neon? | Local first; Neon only after D3. |
| D2 | Fix the missing-commit bug (see §5) in `get_db()` or per router? | Commit at the end of `get_db()` on success, plus an HTTP-level regression test. |
| D3 | Migrations: Neon is already at `011_report_altitude_road_side`, but the repo only has files up to `009_merge_cv_verification`. Whoever wrote `010`/`011` please push those files, and nobody renames or renumbers existing revisions again (my local rename to 009/010 broke the chain and was reverted to the original ids). | Push the missing migration files; keep the original ids. |
| D4 | How do model artifacts reach other machines? `hazard_model.onnx` is 103 MB, above GitHub's 100 MB file limit. | Commit the small files (`risk_model_xgboost_real.pkl`, `risk_calibration.json`, ETA `.cbm`) with `git add -f`; quantise/FP16 the ONNX or use Git LFS. |
| D5 | Branching. | New branch `aiml-integration` off `frontend`, small PRs. |
| D6 | Demo authentication: real OIDC or controlled demo accounts? `DEV_JWT_MODE` must not be on for real users. | Controlled demo accounts on an OIDC-enabled stack. |
| D7 | Do the two/three of us use the **same** database? The shared Neon URL is in one person's `neon-main.env`. Please each check host name and `alembic current`. | Align everyone to one migration head before integrating. |

## 3. Phases

### Phase A: repo hygiene (0.5 day)
- Create the branch; commit in chunks (backend AI, migrations, tests, `ml-training`, docs/memory).
- The repo root contains files that may hold secrets or session data (`cookies.txt`, `env`, `env.download`, `backendenv`) plus `map_e2e_*.png` screenshots. Review, then delete or git-ignore; never commit them. Same for `AGENTS.md`/`.agents/` unless their owners want them tracked.
- Artifacts per D4; scan the diff for secrets; expect `memory.md` merge conflicts.
- **Exit:** fresh clone installs and passes tests; no secrets in history.

### Phase B: make the backend frontend-ready (1 day)
1. Missing-commit fix (D2) + HTTP-level regression test.
2. `GET /api/v1/ai/status`: per-model status (LOADED/STUB), training-data provenance, version, known limitations. The UI uses it to hide tools that are not available.
3. Expose the `cv_*` fields (hazard class, confidence, roadway-blocked) on the reporting API responses so the review screen can show them.
4. A batch risk endpoint (bbox or edge list → risk + top factors); today `predict-risk` is one edge at a time.
5. Upload size/type limits (audio, photos), rate limits on Bhashini-backed endpoints, model warm-up at startup.
6. Regenerate `backend/openapi.json` (`app/scripts/export_openapi.py`), then `pnpm gen:api` in `frontend/`.
- **Exit:** full pytest + HTTP E2E green.

### Phase C: demo data and models (0.5 day; ETA runs in parallel)
- Populate the feature store for the demo corridor (terrain from SRTM, weather from Open-Meteo/NASA POWER, cached).
- **ETA: done** (see `ml-training/scripts/{fetch_eta_ne_routes,generate_eta_ne_dataset,train_eta_ne_model,validate_eta_model}.py`, anchors in `ml-training/anchors/`). Finding that changed the design: OSRM durations are 2–3× too optimistic in NE hills (Guwahati–Shillong 1.29 h vs ~3 h typical), so only OSRM geometry/distance/road-class speed are used and the timings come from a physics model calibrated on 4 published anchor times. Label: `SYNTHETIC_NE_CALIBRATED`. The confidence band now uses the measured route-level spread (±15.5 %) instead of a sqrt(n) independent-error assumption.
- **Still required for a believable ETA demo:** the seeded `road_edges.elevation_gain_m` is 0 for every edge, so ETAs come out flat-terrain optimistic (a 12 t truck on an 87 km seeded route: 2.1 h flat vs 3.9 h with SRTM gains). Populate edge elevation gain from SRTM for the demo corridor (the e2e script `backend/tests/e2e/e2e_eta_http.py` shows the method).
- A model manifest (version, provenance, metrics) feeding `/ai/status`.

### Phase D: frontend integration (2–3 days; partly started, see §1)
Treat the table below as the target list: review the screens already in the working tree against the actual API and honesty rules (labels, advisory-only CV, no fake boxes, provenance chips), then fill the gaps.
New `frontend/src/features/ai/` following the `features/hazard` pattern (React Query hooks with `openapi-fetch`, typed from `schema.d.ts`).

| Screen | Change | Roles |
|---|---|---|
| Field → new report (`ReportWizard`) | Voice or typed-text report. Voice: Hindi/Bengali/English. Text: Assamese/Manipuri/Bodo/Nepali/others. Show "type suggested, please confirm" chips; HIGH/CRITICAL forces an explicit type. | Field officer (`SUBMIT_REPORT`) |
| Field → photo step | Non-blocking "AI check" before upload. | Field officer |
| Gov → report review (`ReportReview`, `evidence.tsx`) | "Run AI verification" and a CV result badge; advisory wording. | Verifier, gov |
| Gov → map / edge detail | AI risk chip and top factors next to the existing hazard overlay. | Gov, logistics |
| Routing | "AI ETA range" beside the route duration, with a provenance chip. | All |
| Fleet / deliveries | "Optimise dispatch" panel (depot, commitments, vehicles → routes, unassigned). | Logistics, gov |
| Status page | Per-model state, provenance and limits from `/ai/status`. | All |

Notes:
- **Voice format:** Bhashini expects WAV at 16 kHz, but `MediaRecorder` produces webm/opus. Convert in the browser (e.g. `OfflineAudioContext` resample → PCM16 WAV); without this voice reports fail.
- Map the new error codes to human messages: `UNSUPPORTED_LANGUAGE`, `EMPTY_TRANSCRIPT`, `SPEECH_SERVICE_UNAVAILABLE`, `MEDIA_OBJECT_UNAVAILABLE`, `INVALID_VOICE_REPORT`, `MODEL_NOT_LOADED`.
- Bhashini takes seconds: loading states. AI tools are online-only; offline users keep the existing typed-report queue.
- Hide a tool when `/ai/status` reports it as STUB. Every AI result carries a label saying what it is.
- Tests: vitest for hooks/components, playwright for the critical flows.

### Phase E: integrated testing (1 day)
On the local stack (Postgres+PostGIS+pgRouting, Redis, object storage, backend, frontend):
- Playwright E2E: field officer submits voice/text report → verifier reviews with AI check → risk on map → dispatch optimisation.
- Role matrix, failure injection (Bhashini down, model file missing, object storage down), latency (ONNX cold start, Bhashini), mobile viewport, oversized/invalid uploads.
- **Object storage:** `infra/compose.yaml` and `memory.md` disagree about MinIO. Auto-triage needs a real S3-compatible store, so settle this first.

### Phase F: demo preparation (0.5 day)
- A deterministic demo scenario script (corridor, a rainy day, sample photos, pre-generated Hindi/Bengali voice notes, Assamese text samples), demo accounts per role, a runbook with talking points, and a fallback (recorded video) if the network or Bhashini is down.
- A "what is real vs synthetic" slide, matching the table in §1.

### Phase G: shared Neon (only after D1–D3 and D7)
Restore point → confirm `alembic current` on Neon matches the repo's chain (the AI schema is already there) → read-only smoke tests → a few clearly tagged write tests → monitoring. Rollback plan: Neon point-in-time restore.

## 4. Timeline (estimate)

| Phases | Effort |
|---|---|
| A + B | ~1.5 days |
| C | ~0.5 day (ETA in parallel) |
| D | 2–3 days |
| E + F | ~1.5 days |
| **Total before Neon** | **~6–7 working days** |

## 5. Risks

| Risk | Mitigation |
|---|---|
| **Missing commit:** `get_db()` never commits and the reporting, incidents, logistics, telemetry and impact routers have no `commit()`. Verified: `POST /api/v1/reports` returned 201 but persisted nothing. Integration tests hide it because they commit manually. | D2 fix + HTTP-level regression test. |
| **Startup writes to the database:** `app/main.py` lifespan runs `seed_regional_network` on every app start, so starting the backend against Neon writes to the shared DB every time (it also seeds facilities with `kind="DISTRIBUTION_CENTER"`, which is not a member of `FacilityKind`, so reading those rows raises `ValueError`). | Owners of the network module: make the seed opt-in/idempotent and fix the enum or the seed data. Meanwhile run local stacks against a local database. |
| **Running tests/seeds on shared Neon** modifies real data (edge statuses, outbox events, telemetry devices, dev users). The risk-refresh worker would change real accessibility statuses. | Test on the local stack; read-only checks only on Neon. |
| CV weak on real phone photos (trained on Roboflow-style images; small test set; easy negatives). | Advisory label; never blocking; no auto-escalation. |
| Bhashini or the network fails during the demo. | Pre-recorded samples, text fallback, recorded video. |
| Frontend/backend types drift. | Regenerate `openapi.json` and run `gen:api` after every backend API change. |
| Intermittent test flake: `test_incident_to_impact_worker` reads a batch of 10 from a shared outbox table. | Give the test its own event scope (owner: coordination/impact). |

## 6. Definition of done

A field officer submits a voice or typed report, a verifier reviews it with the AI check, the map shows AI risk, and routing shows ETA and dispatch optimisation, all under one login, without console errors, with every AI output labelled for what it is.

## 7. After the demo

GSI/NGDR landslide data (verified negatives) for real risk validation; real GPS trips for ETA; more CV classes and real phone photos; Bhashini pipelines for Assamese ASR; time windows and risk penalties in dispatch.
