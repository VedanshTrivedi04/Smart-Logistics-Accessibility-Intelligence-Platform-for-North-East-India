# Shared / Backend: ai (AI/ML)

- **Status:** done (fully integrated across FastAPI backend and Next.js 15 frontend with live end-to-end tests)
- **Last updated:** 2026-09-25

## Endpoints (`/api/v1/ai/`)
predict-risk, verify-photo, auto-triage-report, estimate-eta, optimize-dispatch, transcribe-voice, translate-text (JSON; Bhashini text translation, any authenticated user), text-report (JSON; typed text -> translated field report, capability SUBMIT_REPORT), voice-report (multipart audio -> Bhashini ASR+translation -> field report via Reporting's public facade; capability SUBMIT_REPORT; needs CSRF).

## Frontend Integrations (`frontend/src/features/`)
- `features/ai/`: Shared React Query hooks (`usePredictRisk`, `useVerifyPhoto`, `useAutoTriageReport`, `useEstimateEta`, `useVoiceReport`, `useTranslateText`, `useSubmitTextReport`, `useOptimizeDispatch`).
- `features/field/VoiceReportSection.tsx`: In-browser MediaRecorder voice reporting with regional language selection (hi, bn, as, mni, en) and "Simulate Field Voice Sample" 1-click fallback playback for live demos.
- `features/field/PhotoHazardPreview.tsx`: Real-time client-side image preview and YOLOv8 ONNX inference via `/api/v1/ai/verify-photo` with bounding box & hazard confidence badges.
- `features/incidents/AiVisualTriageDossier.tsx`: Reviewer portal triage dossier showing automated hazard predictions with 1-click confirmation or override.
- `features/routing/DynamicEtaCard.tsx`: Dynamic weather/terrain-aware CatBoost ETA estimates with lower/upper confidence bounds.
- `features/routing/RiskExplainerDrawer.tsx`: XGBoost segment risk analysis with SHAP waterfall explanations and 72-hour monsoon escalation timeline.
- `features/fleet/DispatchOptimizer.tsx` & `DeliveriesView.tsx`: Google OR-Tools CVRP multi-stop solver interface for intelligent vehicle routing and load scheduling.

## Models and data (be honest about provenance)
- Risk (XGBoost, 6 features): REAL - 446 events (GLC 320 + COOLR 126) + 448 background points, Open-Meteo features (dataset real_risk_dataset_v2.csv). Spatial-block CV ROC-AUC 0.771 (v1: 0.744); presence-background, NOT a SIH accuracy claim; temporal holdout unusable (events end 2018). Loaded from `risk_model_xgboost_real.pkl`; probabilities calibrated via `risk_calibration.json` (Platt + prior shift to an ASSUMED 5% prevalence). `RiskAssessment.raw_score`/`decision_score`: the reported probability is calibrated (small), but `risk_refresh_worker` decides on the RAW score (thresholds 0.75/0.40 unchanged) so decisions do not depend on the assumed prevalence.
- ETA (CatBoost): SYNTHETIC_NE_CALIBRATED (2026-09-25; see "ETA data pipeline" below): 44 real NE corridors (OSM geometry, SRTM, real sampled rain) + physics labels calibrated on 4 published car times. Leave-corridor-out route MAPE 12.6 % (vs synthetic labels, NOT real trips); held-out anchors 14 % mean error (old synthetic 26 %, OSRM 56 %). `estimate-eta` returns `training_data`; band uses route-level spread (+-15.5 %).
- CV hazard (YOLOv8m -> ONNX, 640px, trained on Colab T4, LIVE in backend since 2026-09-25): REAL Roboflow landslide photos (356 unique positives after de-dup) + 300 Wikimedia negatives (merged_v3, leak-free split). Single class `landslide` -> `detectable_classes=[LANDSLIDE]`; flood/tree/road-damage/CLEAR_ROAD NOT covered. Box mAP50 is poor (test 0.29, loose boxes) but image-level detection is good: threshold 0.10 chosen on VAL (max F2); TEST 54 landslide + 45 clear images: precision 0.914, recall 0.981, false-alarm 11.1% (5/45); identical through the backend pipeline and over HTTP. Caveats: small test set (CI wide), easy negatives (town/road photos), positives are Roboflow-style (aerial/stock) not phone field photos -> real-world performance unknown; score is a raw detector score (rarely >0.5), not a probability. Old synthetic model kept as `hazard_model_synthetic.onnx`.
- Dispatch (OR-Tools): no training; tested read-only on real DB data (13 commitments, 42 vehicles); ignores `required_before` deadlines.
- Voice (Bhashini): LIVE-verified with a real key on 2026-09-25 (ASR hi/bn/en only; as/mni/brx/ne text translation only via `/ai/translate-text` and `/ai/text-report`; kha/lus/grt none); supports both Udyat Key (`BHASHINI_API_KEY`) and Inference Key (`BHASHINI_INFERENCE_KEY`) via `backend/bhashini.env`.

## Data assets
`data/landslide_catalog/` (GLC 320, COOLR reports 446, merged 446 with provenance); `ml-training/data/real_cv/` (Roboflow CC BY 4.0 + Wikimedia CC BY/BY-SA; attribution.csv required if redistributed).

## Known issues / TODO
- Add LHASA susceptibility feature; better temporal validation (leave-one-year-out); v1 artifacts kept as *_v1 in ml-training/models.
- Real DB untouched by the AI track (read-only checks). Migrations: Neon is at `011_report_altitude_road_side` with the AI schema applied under the ORIGINAL ids `007_ai_feature_store` -> `008_reporting_cv_verification` -> `009_merge_cv_verification` (a local rename to 009/010 was reverted 2026-09-25; never renumber revisions; the repo lacks the 010/011 files).
- Roboflow sets overlap (drone_roads contains raghava's 98 images) and hold augmented near-duplicates -> always de-dup + cluster-split (build_real_cv_dataset_v3.py); earlier v1 CV metrics were leak-inflated.
- Integration tests need a local Postgres (Docker) - not run against Neon.

## Testing (verified 2026-09-25, LOCAL DB only)
- Local test stack: docker `ner_test_pg` (pgrouting/pgrouting:16-3.4-3.6.1 = PostGIS 3.4/pgRouting 3.6.1, SSL enabled because db.py hardcodes ssl=require; Neon is PostGIS 3.3/pgRouting 3.4.2) on :55432 + `ner_test_redis`. Migrations 002->010 apply clean; 009/010 downgrade/upgrade round-trip OK. Integration tests need seeds: seed_demo, load_pilot_corridor, seed_fleet_demo, seed_reporting_demo.
- Full pytest 459 passed; HTTP E2E `backend/tests/e2e/e2e_ai_http.py` 22/22 (dev-session+CSRF, predict-risk, estimate-eta, optimize-dispatch, verify-photo, transcribe-voice stub, auth/CSRF rejections).
- E2E found + fixed: auto-triage returned 500 when media object missing in storage -> now 422 MEDIA_OBJECT_UNAVAILABLE; missing report -> 404 REPORT_NOT_FOUND; report without clean media -> 422 MEDIA_OBJECT_UNAVAILABLE.
- Tried extra risk features (LHASA susceptibility - 50% NoData and circular with the NASA labels; rainfall 24h/48h/8d): no CV gain, not used. Risk model plateau ROC-AUC ~0.77.
- Pytest on Windows had a random flake (asyncio Proactor `unclosed transport` finalised by GC -> fails an unrelated test under filterwarnings=error); narrowly ignored in pyproject.toml; 465 passed x6.
- Gaps: frontend does not call any /ai endpoint yet; auto-triage tested only with mock storage (no MinIO); CV model in backend is still the synthetic one.

## Voice -> report (`POST /ai/voice-report`, added 2026-09-25)
- Form: file, source_language, latitude, longitude, accuracy_m (required); report_type, severity, observed_at, client_operation_id (optional). Response 201 with `inferred_fields` flags.
- Safety rules (domain/voice_report.py): severity is NEVER inferred (default MEDIUM, flagged); report_type may be keyword-suggested (flagged), fallback OTHER; HIGH/CRITICAL requires an explicit report_type (else 400 INVALID_VOICE_REPORT) so a mis-heard keyword cannot trigger Policy 21 auto provisional caution; report always enters review (SUBMITTED, or PROVISIONAL_CAUTION only via explicit type+severity); description carries an "auto-transcribed, unverified" tag + English + original text; empty transcript / STUB translator create nothing; location validated and unsafe combos rejected BEFORE the ASR call; idempotent replay via client_operation_id skips ASR. Audio is not stored.
- Route commits explicitly (get_db does not - see known-issues.md).
- Live E2E `backend/tests/e2e/e2e_voice_report_http.py` 17/17 with real Bhashini (Hindi sample WAV made with Bhashini TTS); unit 27 + integration 4 tests.
- Not done: Assamese/Manipuri voice (no ASR at Bhashini) -> typed-text translation path; frontend UI; storing the audio as media.

## Hazard verifier rules (2026-09-25)
- Letterbox preprocessing (was a squashing resize); `CONFIDENCE_THRESHOLD` 0.10 (val-chosen); "nothing found" confidence = 1 - max score (was a constant 1.0); `is_roadway_blocked` only when confidence >= 0.50 (so a landslide-only model effectively never auto-escalates; human review decides); response/entity expose `detectable_classes`; auto-triage does NOT write a "CLEAR_ROAD" verdict onto a report when the model cannot recognise CLEAR_ROAD.
- Reproduce/inspect: `ml-training/scripts/eval_onnx_verifier.py <onnx>`; Colab package/notebook in `ml-training/colab/`.
- Next for CV: more positives (esp. real NE phone photos), more classes (flood, tree fall, road damage, hard negatives such as bare/rocky slopes), field validation before trusting it beyond triage.

## Typed-text path for languages without ASR (added 2026-09-25)
- Bhashini (this key/pipeline): ASR only for hi/bn/en (+ta/te/or/mr/gu/pa/ml/kn/ur); Assamese/Manipuri/Bodo have TTS + translation but NO ASR, Nepali translation only, Khasi/Mizo/Garo nothing. Script codes do not change this (probed). Other Bhashini pipelines untested - ask Bhashini support/dashboard.
- `POST /ai/translate-text` {text<=2000, source_language, target_language=en} and `POST /ai/text-report` (same fields/rules as voice-report + text; description tagged "[Text report - machine-translated, unverified]" with original text kept). Shared safety rules; unsupported language -> 422 UNSUPPORTED_LANGUAGE and nothing saved. Same-language input skips the API. Live-verified: Assamese/Nepali -> correct English; bridge-broken phrasing now suggests BRIDGE_COLLAPSE.
- `SpeechTranslationPort` gained abstract `translate_text` (new `TextTranslation` entity); tests: 24 unit + 1 integration, HTTP E2E `backend/tests/e2e/e2e_text_report_http.py` 19/19 (real Bhashini), voice E2E 17/17 still passes after the shared-helper refactor.

## ETA data pipeline (2026-09-25)
Run from `ml-training/`: `fetch_eta_ne_routes.py` (OSRM geometry + SRTM + Open-Meteo rain, cached) -> `generate_eta_ne_dataset.py` (calibrate `q`=0.93, `c_ref`=200 on `anchors/eta_ne_anchors.json`, simulate 1,760 trips / 35,917 segments; physics in `eta_physics.py`) -> `train_eta_ne_model.py` (CatBoost, monotone +1 on all 5 features, RMSE weighted 1/sqrt(duration); leave-corridor-out CV) -> `validate_eta_model.py` (held-out anchors, monotonicity, physical sanity).
- OSRM durations are NOT used (2-3x too fast in NE hills); loss choice matters (1/duration^2 weighting biased route totals -15 %). Hidden road curvature limits accuracy (oracle route MAPE 8.2 % vs 12.6 %).
- Gaps: seeded `road_edges.elevation_gain_m` is 0 (flat-terrain optimistic ETA until populated from SRTM); anchors are approximate travel-site car times; replace with real GPS trips when available.
- E2E scripts in `backend/tests/e2e/` (ai 23, voice 17, text 19, eta 10 checks) now use a separate DB `ner_e2e` (env `E2E_DB`) because the API auto-seeds on startup (see known-issues.md).
