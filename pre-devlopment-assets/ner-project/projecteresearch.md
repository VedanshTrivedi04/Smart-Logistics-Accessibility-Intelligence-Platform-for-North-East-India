# Project research, gaps and innovation assessment

## Executive assessment

The existing context is strong on stakeholder separation, three shared-data portals, incident-to-impact reasoning and low-connectivity requirements. It correctly distinguishes mandatory capabilities from optional public access and emergency-mode interpretation. It is not yet an engineering specification: ownership of road status, data access, network topology, lifecycle rules, operational failure modes and measurable success are mostly missing.

The strongest product is not another dashboard. It is an evidence-aware essential-supply continuity system: detect a disruption, identify the exact transport edges affected, find affected trips and recipients, propose constrained alternatives, assign an accountable decision-maker and retain the decision trail.

Do not add a fourth portal or a general chatbot before this closed loop works. Do not equate a colorful risk score with validated AI. The numerical scores in the supplied context are examples, not training labels, measured probabilities or acceptance thresholds.

## Research evidence and limits
### Multilingual notification delivery

Bhashini (Digital India Bhashini Division, MeitY) is the Government of India's
National Language Translation Mission platform, offering free text translation,
ASR and TTS APIs across 22 scheduled languages including Assamese, Bengali,
Bodo, Manipuri and Nepali. Documentation visibility does not establish rate
limits, latency, or coverage for languages outside the 22 scheduled ones
(several NER languages, e.g. Khasi, Mizo, most Naga languages, are not
covered). [Bhashini] (https://bhashini.gov.in)

Action: obtain API access, capture real sample translation/TTS responses,
confirm supported language codes and latency, and register a reviewed-template
fallback for uncovered languages rather than relying on unreviewed machine
translation for emergency wording.

### Official weather observations and warnings

IMD publishes API reference material covering forecasts, district warnings, observations, rainfall and highway-related warnings. This supports a provider-adapter strategy rather than scraping arbitrary weather pages. Documentation visibility does not establish permission, uptime, rate limits, latency or full pilot coverage. Its API landing page points users toward IP-whitelisting/access arrangements. [IMD reference](https://api.imd.gov.in/public/api_reference.html) [IMD access](https://mausam.imd.gov.in/responsive/apis.php)

Action: obtain access, capture real authorized sample payloads, confirm timestamps, units, missing-value conventions and district identifiers, and register permitted caching/redistribution. A district rainfall forecast is not a road-specific failure probability. Keep forecast issue time separate from valid time and ingestion time.

### Disaster alerts

SACHET is NDMA's CAP-based official alert dissemination portal and advertises an RSS feed. Ingest warnings as attributed external evidence; do not claim that every warning is a confirmed road closure. The exact feed contract and allowed polling interval still need validation. [NDMA SACHET](https://sachet.ndma.gov.in/)

Action: retain original alert identifiers, issuer, issued/effective/expiry times, geography, language and update/cancellation references when supplied. Quarantine malformed alerts, deduplicate repeated items and expire warnings rather than keeping them active indefinitely.

### Landslide intelligence

GSI's Bhusanket portal provides landslide-related resources, forecasting-centre information, a map viewer and reporting access. This research did not establish a documented unrestricted machine API, complete road-level NER coverage or access to historical training labels. It is a candidate partnership/data-request source, not a promised plug-and-play integration. [GSI Bhusanket](https://bhusanket.gsi.gov.in/)

Action: confirm coverage, resolution, publication cadence, permissions and accessible historic inventories with the authority. Do not substitute susceptibility maps for near-term forecasts. Until validated labels exist, use an explicitly labelled advisory rules baseline.

### Maps, boundaries and routing

OpenStreetMap data is available under ODbL with attribution obligations. Open data does not imply unrestricted use of community-hosted tile services. Review derived-database obligations before distributing a combined dataset. [OSM licensing](https://www.openstreetmap.org/copyright)

The standard tile.openstreetmap.org service prohibits bulk downloading and offline use. Field offline map packs therefore require your own tile pipeline or a provider contract allowing offline storage, with bounded geography, zoom and expiry. [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles)

India's geospatial guidelines identify Survey of India maps/digital boundary data as the standard for political boundaries. Validate the chosen display layers and sensitive attributes before publishing a government-facing map. This is a compliance review requirement, not proof that a particular downloaded boundary file is approved. [DST guidelines](https://geospatial.dst.gov.in/Guidelines.aspx)

pgRouting documents Dijkstra-family routing and interpreting negative directional costs as absence of an edge. For this project, preferably exclude blocked or incompatible edges explicitly; never merely penalize a hard closure. Topology, one-way access and vehicle restrictions must be correct before shortest-path results are meaningful. [pgRouting](https://docs.pgrouting.org/3.8/en/dijkstra-family.html)

### Browser offline limits

Next.js provides PWA guidance, but offline report persistence and replay remain application responsibilities. Avoid making experimental framework features a prerequisite for core field submission. [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)

Background Sync has limited browser availability. Build foreground retry, app-resume retry and a visible manual Sync action first; service-worker background sync is an enhancement, not a delivery guarantee. A PWA must not be the sole promised source of continuous background vehicle telemetry. Use a GPS device/provider or a separately validated native solution. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)

### Authorization and privacy

PostgreSQL row-level security has bypass cases: superusers and BYPASSRLS roles bypass it, and owners normally bypass it unless forced. Use a non-owner runtime role, restricted worker identities and explicit application authorization in addition to RLS. [PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

MeitY publishes the DPDP Rules 2025, a corrigendum and an enforcement timeline. Applicability and commencement must be checked for the actual organization and deployment date; do not claim blanket compliance or that all provisions are simultaneously effective. Driver-linked telemetry, reporter identifiers and photos warrant privacy-by-design. This is engineering guidance, not legal advice; obtain qualified Indian legal review before a real deployment. [MeitY](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa)

## Gap analysis

| Gap | Why the current context is insufficient | Proposed resolution |
|---|---|---|
| Verified operating scope | All-NER ambition conceals data and validation cost | One corridor plus alternate roads and selected recipients; owner approves coverage |
| Data inventory | Weather/GPS/government systems are named, not contracted | Provider registry, licenses, sample contracts, latency and fallback matrix |
| Canonical road network | Road lines alone are not routable | Directed edges, intersection topology, bridge links and versioned restrictions |
| Status authority | Field reports and verified truth are conflated | Separate observations, review decisions and temporal accessibility state |
| Conflicting evidence | Two observers can disagree | Keep both observations, conservative caution and explicit adjudication |
| Staleness | Old green map markers can look current | Validity windows, unknown state, source-age badges and stale-position rendering |
| Assignment model | Roles do not establish data access | Organization ownership, jurisdiction grants, trip assignments and delegated scopes |
| Dispatch accountability | Alternatives are shown without approval rules | Recommendation/approval/dispatch separation and audit trail |
| Supply impact | Cargo category alone cannot establish shortage | Facilities, stops, commitments and optional verified stock/consumption snapshots |
| Offline guarantees | Queueing alone misses retries/conflicts | Client operation IDs, server idempotency, per-item outcomes, explicit conflict handling |
| GPS reliability | No device or telemetry-quality contract | Authenticated provider adapter, event-time handling, accuracy checks and replay guard |
| AI evidence | No labelled events, split strategy or evaluation | Rules baseline; historical spatial/temporal validation before ML promotion |
| Security/privacy | Login is not enough | Backend scope enforcement, object ownership, protected media, retention and audit |
| Operations | No restore, lag or incident procedure | Health checks, backups/PITR, restore drill, outbox monitoring and fallback runbook |
| Acceptance | Features are listed but success is undefined | Scenario tests, route invariants, measured pilot targets and human sign-off |
| Language coverage | Multilingual notification is a stated requirement but no
provider was named | Bhashini as translation/TTS adapter; reviewed templates
for uncovered NER languages |
| Transport database integration | Named as a requirement but no concrete
system identified | ULIP as registry gateway; AIS-140 as the device standard
for the GPSProvider adapter |

## Prioritized innovation

### P0: Evidence-aware accessibility

Display physical status, evidence status and hazard separately. For example: RESTRICTED / VERIFIED / HEAVY_RAIN_ADVISORY / checked 18 minutes ago. Confidence combines provenance, verification and age, not an arbitrary average of conflicting reports. A high-trust closure remains blocked until an authorized reopening decision; expiry produces UNKNOWN, not OPEN.

Value: prevents false reassurance and makes the platform credible. Inputs: observations, issuer authority, validity and audit. Pilot test: operators distinguish stale or unverified evidence correctly in a scripted usability exercise.

### P0: Incident-to-essential-supply impact

Connect incidents to graph edges, route-plan versions, trips, delivery stops and facilities. Recompute only affected active trips. Show known affected commitments and state explicitly when inventory data is absent. A road touching a district does not prove that the whole district is inaccessible.

Value: gives government a prioritized action list instead of marker counts. Pilot test: exact impacted deliveries match seeded scenarios; no double-counting when one trip crosses several affected edges.

### P1: Critical-facility reachability and isolation watch

Assess whether each enrolled facility is reachable from a nominated supply hub under a vehicle profile. Distinguish NO_FEASIBLE_PATH from INSUFFICIENT_DATA. Report covered facilities and coverage denominator, not unsupported region-wide population counts.

Value: flags hospitals or supply points at risk before a driver reaches a blockage. Dependencies: trustworthy facility coordinates and graph restrictions. Stretch: dispatch field verification to the uncertain edge whose confirmation would most reduce uncertainty.

### P1: Decision receipts and scenario comparison

Every recommendation carries an immutable input snapshot, excluded edges, remaining uncertainty, route time range, policy version and human decision. A what-if closure branches from a snapshot and never edits live status.

Value: reproducible decisions and fair comparison of wait, reroute or defer. Dependencies: graph/status versions and incident-to-impact join. Evaluation: replay yields the same result given the same frozen inputs.

### P1: Supply runway, only with real inventory

When a facility supplies timestamped stock and consumption records, estimate time until stockout and compare it with a conservative replenishment arrival estimate. Respect units and stock allocations; display a range and stale-data warnings. Without those records show delivery deadline risk, not a fabricated stockout prediction.

Value: prioritization by consequences, not cargo labels alone. A construction shipment may be emergency-critical, so priorities are authorized values with reason, not a fixed medicine > food > construction rule.

### P2: Learned delay and hazard models

Train delay estimates only after collecting usable trip histories. Explore disruption prediction separately with labelled road-time windows, forecast issue-time provenance and verified event onset. Prefer interpretable baselines before complex spatiotemporal models.

Value: quantitative improvement only if measured. Never call historical OSM completeness or rain correlation predictive accuracy. No target accuracy is asserted in this pack.

### P2: Multimodal continuity

Road-ferry-road or road-rail transfer can be valuable where operationally relevant. Requires schedules, transfer delays, loading capabilities, weather restrictions and permissions. Air evacuation or drone dispatch is outside MVP and must never be inferred from map proximity.

## Model evaluation plan

Define each task before modelling: probability of a disruption on a directed segment during a specified future window; conditional trip delay; or facility reachability under a snapshot. These are different outputs with different labels.

Collect negative examples carefully: absence of a report is not necessarily an open road. Mark observation coverage and censor unknown windows. Features can include permitted rainfall histories/forecasts, terrain features, road class, verified incidents and travel histories. All must have been available at the prediction issue time.

Split by time and hold out geography/corridors. Use rolling evaluation across weather regimes, prevent duplicates across splits and assess missing-data cohorts. Compare against seasonal/base-rate and simple rules baselines. Report PR-AUC, precision/recall at an agreed operating point, false alerts per corridor-day, lead time and Brier/calibration measures for probabilities. For ETA, report MAE and prediction-interval coverage by route/weather/cargo constraints. Record sample counts and confidence intervals.

Promote only after an approved evaluation report, shadow deployment, human review and rollback drill. A threshold such as minimum recall is a stakeholder decision after observing base rates and costs; it is not invented here. Monitor drift, missingness, geographic coverage and operator overrides. Disable model recommendations outside validated coverage.

## Build-versus-defer recommendation

Build: shared identity, scoped portals, road graph, offline reports, verification, delivery/trip entities, one GPS adapter or labelled simulator, one weather adapter, deterministic constrained routes, essential-supply impact and acknowledged alerts.

Defer: public portal, generalized chatbot, automated dispatch, full inventory management, all-NER expansion, advanced ML, full digital twin and broad multimodal routing. These are future stages, not forgotten features.

## Research validation checklist

Before real-world use, capture actual provider samples; assess pilot-road connectivity and missing restrictions; obtain operator interviews and district status authority; document licensed map distribution; test offline on target devices; measure GPS gaps; inventory historical labels; validate disaster-feed update semantics; review privacy and geospatial obligations; and record signed pilot acceptance.

The research establishes viable design directions and real constraints. It does not establish provider SLAs, a budget, a specific available pilot dataset, regional prediction coverage or operational safety.

### Transport and vehicle data integration

ULIP (Unified Logistics Interface Platform, under PM Gati Shakti) is a single
API gateway integrating dozens of government transport/logistics systems,
including FASTag toll-crossing data and Vahan vehicle-registration data. Vahan
access is typically gated behind authorized-entity approval and is not a
guaranteed pilot-day integration. AIS-140 is MoRTH's device standard for
commercial-vehicle VLTDs, requiring a hardware panic button and periodic GPS
transmission to State Monitoring Centres. [ULIP](https://www.ulip.dpiit.gov.in)

Action: register for ULIP developer access early given approval lead time;
treat Vahan/FASTag as a registry cross-check, not the primary telemetry
source; confirm whether pilot vehicles are already AIS-140 fitted or whether
a separate device/provider contract is required.



| vehicles | org_id, reference, class, dimensions, weight limits,
registry_verification_ref | Hard constraints unit-normalized; registry_ref
optionally links a Vahan/ULIP-verified registration, absent if unverified |