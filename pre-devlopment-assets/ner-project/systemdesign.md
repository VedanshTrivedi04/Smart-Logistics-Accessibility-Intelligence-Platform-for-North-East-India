# System design and domain specification

## Scope and release boundary

Pilot MVP: one approved corridor with realistic alternate paths, enrolled facilities and fleets, and three role-aware interfaces sharing one backend. Emergency mode is a filtered government workspace, not a permission bypass. Public access, inventory optimization, autonomous dispatch and validated disruption ML are later phases.

This specification turns the supplied conversation context into proposed engineering decisions. The original requirements are represented by accessibility monitoring, disruption advisory/prediction capability, alternate routes and delays, GPS tracking, alerts, field reports, dashboards, multilingual notifications and offline synchronization. A rules-based MVP is an honest first stage, not completion of a validated ML-prediction requirement.

## Primary user journeys

1. A field officer captures a report and optional photo without connectivity. The app shows Saved on device, then submits exactly one logical report after network recovery.
2. A district verifier reviews evidence and scope, rejects a duplicate or records a confirmed closure. A reporter cannot approve their own report.
3. The backend versions affected edge status, invalidates relevant route plans, calculates enrolled deliveries at risk and creates scoped alerts.
4. A logistics coordinator sees only owned/assigned trips, requests constrained alternatives and records a dispatcher's decision. Recommendation does not automatically redirect a vehicle.
5. A government user sees reachable enrolled facilities, affected commitments and unresolved actions, with coverage and freshness indicators.
6. An authorized reopening decision updates the road state. It does not erase incident history or silently resolve an alert before assigned actions are complete.

## Permissions and scope matrix

Permissions are capabilities evaluated together with organization membership, jurisdiction grants, resource ownership, assignment, delegation validity and action-specific rules. Display roles alone never authorize an API request. Government access to operator records is explicitly granted, not assumed from a broad geographic role.

| Role and surface | Allowed pages and actions | Data scope / limits |
|---|---|---|
| Regional authority / government | Overview, map, incidents, impact, reports, alert monitoring | Authorized regional aggregates; sensitive fleet detail only under sharing grant |
| State authority / government | Same views; assign response within grant | State jurisdictions and explicitly shared records |
| District verifier / government | Review queue, evidence, road decisions, alert assignment | District grants; no self-verification |
| Emergency coordinator / government | Emergency mode, critical facilities, scenarios, escalation | Time-bounded area/organization grants; no automatic expansion |
| Field officer / field | Capture, own reports, assigned tasks, nearby alerts | Own observations and assigned area; cannot publish verified status |
| Local authority / field or government | Capture and assigned verification, if separately granted | Role alone does not grant review; requires verifier capability |
| Road inspection / field | Road/bridge observations and evidence | Assigned assets; same verification separation |
| Fleet manager / logistics | Fleet, vehicles, trip planning, operational assignment | Owned organization and granted assets |
| Delivery coordinator / logistics | Deliveries, stops, commitments, ETA, alerts | Organization and assignment; cannot change verified road state |
| Transport operator / logistics | Assigned trip, recommended route, own actions | Assigned vehicles/trips only |
| Platform administrator | Identity/configuration and operational diagnostics | Does not automatically receive raw reporter/driver media access |

Source data created by each role: field users create observations/media; verifiers create signed review and road-status decisions; coordinators create trips/deliveries and dispatch decisions; responders create acknowledgements/actions. Government read dashboards consume projections, not separate duplicated source tables. Provider identities submit weather/telemetry under machine-specific grants only.

## Domain semantics

### Separate status axes

Accessibility: OPEN, RESTRICTED, BLOCKED, UNKNOWN. Verification: SUBMITTED, UNDER_REVIEW, VERIFIED, REJECTED. Incident lifecycle: ACTIVE, MONITORING, RESOLVED. Hazard advisory: NONE, ELEVATED, HIGH, UNKNOWN. These are different fields, not one overloaded status enum.

OPEN means evidence supports access for specified conditions at a stated time. It is not a safety warranty for every vehicle. RESTRICTED requires structured conditions, such as vehicle class, maximum weight/height, direction or operating window. Missing restrictions cannot default to universally unrestricted.

A submitted closure observation triggers PROVISIONAL_CAUTION and a review task; the pilot's conservative routing policy excludes the implicated edge for critical dispatch until adjudicated. This provisional exclusion is distinguished from a verified legal closure. A verified closure remains excluded. On evidence expiry, show UNKNOWN and require review, never infer reopening. A road reopening is a separate authorized decision supported by fresh evidence.

Conflicting reports are retained with provenance. Do not average OPEN and BLOCKED into a yellow score. Open a conflict case and keep the conservative exclusion until a verifier resolves it. Source authority, accuracy and timestamp are evidence attributes, not immunity from review.

### Observation and incident lifecycle

A report is an immutable submitted observation plus later evidence attachments. Review decisions and corrections are append-only revisions. Multiple observations may support one incident, linked through incident_reports. A submitted report can enter UNDER_REVIEW then VERIFIED or REJECTED. A reviewer may reject at submission if a reason is recorded. Verification produces or links an incident and explicit status decisions; not every verified incident implies a blocked road.

Incident ACTIVE -> MONITORING -> RESOLVED; MONITORING may return to ACTIVE with new evidence. Reopening a resolved incident creates a new lifecycle event with reason rather than rewriting the old history. Updates use optimistic version checks and action-specific endpoints.

### Alert and logistics lifecycle

Alert OPEN -> ACKNOWLEDGED -> ACTIONED -> RESOLVED. Assignment is separate from lifecycle; reassignment preserves acknowledgement history. Suppression requires reason and expiry. Delivery provider states (queued/sent/delivered/failed) are separate from human acknowledgement. A transport receipt is not proof that the responsible person acted.

Delivery PLANNED -> ASSIGNED -> IN_TRANSIT -> DELIVERED, with CANCELLED from pre-delivery states and cancellation reason/authority. DELAYED and AT_RISK are derived flags, not competing lifecycle states. Trip and vehicle are separate: a trip has one vehicle in MVP, a delivery belongs to a trip through explicit stops/assignment, and assignment changes are revisioned. Multi-vehicle consignment splitting is deferred.
| alerts, alert_events | dedup_key, audience_scope, severity, state, assignee,
language; action audit | Notification attempts separate from user actions;
language resolved from recipient preference or jurisdiction default |

Notification templates are keyed by event code and language, not free-form
translated text at send time. Event codes stay stable across languages so
downstream systems and audits never depend on translated wording.

## Data model

Use UUID identifiers, created_at/updated_at and version counters where mutable. Provider keys remain separate from internal keys. All user-controlled timestamps are validated but retained alongside server receipt time. JSONB stores source-specific metadata, not the primary relational model.

| Entity | Essential columns | Relationships / constraints |
|---|---|---|
| organizations | id, name, kind, status | Government units and operators |
| users, memberships | identity_subject, org_id, role, active | Unique identity issuer + subject; memberships may expire |
| jurisdictions, grants | parent_id, geom, grantee, capabilities, valid_until | Versioned approved boundaries; explicit scope grants |
| sharing_grants | owner_org_id, recipient_org_id, resource_kind, fields, scope, expires_at | Enables lawful cross-organization operational sharing |
| facilities | id, name, kind, point, jurisdiction_id, source_id | Synthetic labels in demo; verified coordinates in pilot |
| network_versions | id, source_manifest, built_at, status | Routing snapshots immutable |
| road_nodes | id, network_version_id, point | Topological endpoints, not every geometry vertex |
| road_edges | id, network_version_id, source_node, target_node, geom, base_seconds | Positive traversal cost; direction and class |
| edge_restrictions | edge_id, kind, value, unit, direction, valid_from/to, source_id | Hard constraints and unknown attributes explicit |
| bridges, bridge_edges | bridge_id, geometry, inspection_at; edge_id | Many edges may traverse one bridge |
| reports | id, reporter_id, org_id, point, accuracy_m, observed_at, received_at, type, severity, review_state | Client operation uniqueness; source provenance |
| media_objects | id, owner_id, object_key, checksum, byte_size, mime, scan_status | Private; report links only after ownership/scan validation |
| incidents, incident_reports, incident_edges | lifecycle, onset_at, resolved_at; association IDs | Evidence and edge mapping independent; mapping reviewed |
| review_decisions | report_id, reviewer_id, decision, reason, created_at | Reviewer != reporter; immutable |
| edge_status_events | edge_id, status, restrictions, valid_from/to, incident_id, reviewer_id | Append-only; no silent OPEN at expiry |
| edge_status_current | edge_id, status_version, status, freshness, source_event_id | Rebuildable projection, transactionally consistent version |
| vehicles | org_id, reference, class, dimensions, weight limits | Hard constraints unit-normalized |
| devices, vehicle_device_assignments | device_id, secret_ref, vehicle_id, valid_from/to | Rotatable identity; time-bounded assignment |
| positions | device_id, sequence, event_at, received_at, point, accuracy_m, speed | Unique device + sequence; partition by event period when needed |
| vehicle_latest_position | vehicle_id, position_id, event_at | Newer valid event time only; stale flag derived |
| trips, trip_stops | org_id, vehicle_id, state; facility_id, sequence, windows | No overlapping active vehicle assignments unless explicitly supported |
| deliveries | trip_id, recipient_id, cargo_kind, priority, deadline, state | Quantity/unit optional but consistent; priority reason |
| route_plans, route_plan_edges | trip_id, graph_version, status_version, policy_version, result, expires_at; edge_id, ordinal | Immutable revisions, scoped to requesting org |
| dispatch_decisions | trip_id, route_plan_id, actor_id, action, reason, decided_at | Human acceptance/rejection; revalidate at decision |
| weather_observations | provider, external_id, issued_at, valid_from/to, received_at, geom, units | Preserve source resolution and missing values |
| external_alerts | issuer, external_id, sent_at, expires_at, geometry, references | Deduplicate issuer + external identity; update/cancel chains |
| risk_assessments | edge_id, issued_at, horizon, method_version, label, explanation | Optional probability only if validated calibrated model |
| alerts, alert_events | dedup_key, audience_scope, severity, state, assignee; action audit | Notification attempts separate from user actions |
| idempotency_records | actor_id, endpoint, key, payload_hash, response, expires_at | Unique scope; mismatch -> conflict |
| sync_results | client_operation_id, actor_id, resource_id, status | Durable report-operation uniqueness survives response-cache expiry |
| outbox, consumer_receipts | id, event_type, aggregate_id, version, payload, published_at; consumer_id | At-least-once processing with dedup receipts |
| audit_events | actor, action, resource, reason, request_id, occurred_at, change_summary | Restricted append-only access; redact sensitive fields |
| scenario_runs | owner_org_id, snapshot_ids, hypothetical_changes, results, expires_at | No mutation of live road status |

Optional after MVP: inventory_snapshots with facility, item, quantity/unit, reserved stock, observed_at and consumption provenance. Do not infer stock from shipment categories.

## Spatial and temporal rules

Use geometry(Point/LineString/MultiPolygon,4326) for exchange, bounded GeoJSON [longitude, latitude], UTC ISO-8601 timestamps and explicit units. Use geography for metric proximity unless a suitable local projection is selected. Road-edge intersection with an incident polygon creates candidate associations, not automatic truth. Human confirmation or a reviewed mapping rule determines operational edge association.

A route may cross district lines. Authorization applies to resource access and shared information, not deletion of public traversable edges at a jurisdiction border. A district user can receive a permitted route through adjacent territory without receiving unauthorized fleet or reporter detail there.

## REST API contract

Prefix /api/v1. Authenticated same-origin browser requests use secure HttpOnly session cookies; CSRF token and Origin validation protect unsafe methods. Machine telemetry uses separately scoped credentials. Pydantic response schemas prevent accidental internal-field exposure. Page cursors are opaque; default page size 50, maximum 200. IDs are opaque UUIDs. Filters never override authorization.

| Endpoint | Purpose | Required rule |
|---|---|---|
| GET /me | Identity, capabilities, granted scopes | Server resolves claims/grants |
| GET /dashboard | Scoped aggregate summary | Include coverage and as_of |
| GET /network/edges?bbox=... | Bounded map data | Graph/status version and simplification |
| GET /facilities/{id}/reachability | Hub/vehicle constrained access | Distinguish coverage gap from no path |
| POST /media/uploads | Allocate owned upload | MIME/size allowlist, short expiry |
| POST /media/{id}/complete | Verify finished upload | Check object size/checksum/scan |
| POST /reports | Submit observation | Idempotency-Key mandatory |
| GET /reports and GET /reports/{id} | Queue/detail | Own or granted review scope |
| POST /reports/{id}/review | Start/reject/verify review | If-Match, no self-verify, reason |
| POST /reports/{id}/evidence | Link additional completed media | Ownership and version check |
| GET /incidents/{id} | Evidence + impact summary | Field-level privacy |
| POST /incidents/{id}/status-decisions | Authorized edge-state decision | Reason, validity, evidence, If-Match |
| POST /sync/reports | Batch independent report operations | Per-item durable result |
| POST /telemetry/batches | Authenticated device/provider ingest | Sequence replay guard, max batch |
| GET /vehicles and GET /trips/{id} | Fleet and operational details | Ownership/assignment/sharing |
| POST /deliveries and POST /trips | Create planned work | Organization capabilities |
| POST /trips/{id}/assign | Vehicle/stop assignment | Revision check, conflicts |
| POST /routes/evaluate | Snapshot-based route alternatives | Hard constraints; scoped plan |
| POST /trips/{id}/dispatch-decisions | Accept/reject a recommendation | Revalidate version/expiry |
| GET /alerts | Personalized alerts | Server-side audience filter |
| POST /alerts/{id}/actions | Assign/acknowledge/action/resolve | Allowed transition and reason |
| POST /scenarios | Start read-only hypothetical analysis | Owner scope and bounded compute |
| GET /scenarios/{id} | Scenario result/status | Owner or explicit grant |
| GET /events | SSE invalidation/events | Same authorization as REST; resumable cursor |

Health endpoints /health/live and /health/ready expose no sensitive diagnostics. Protected feed-health and queue-lag details belong to operations views.

### Representative JSON shapes

~~~json
{
  "client_operation_id": "<client-generated-uuid>",
  "type": "LANDSLIDE",
  "severity": "HIGH",
  "observed_at": "<ISO-8601-UTC>",
  "location": {"type": "Point", "coordinates": [91.7, 26.1]},
  "accuracy_m": 15,
  "description": "Illustrative field observation, not a real incident",
  "media_ids": [],
  "suspected_edge_ids": []
}
~~~

Coordinates above are illustrative input syntax, not evidence of any actual incident. Backend derives actor and organization; it does not accept trusted reported_by, verified or owner fields from this payload. Suspected edges are hints requiring mapping validation.

~~~json
{
  "code": "VERSION_CONFLICT",
  "message": "The record changed. Review the current version before retrying.",
  "request_id": "<server-request-id>",
  "details": {"current_version": 4}
}
~~~

Use 400 for malformed operations, 401 for authentication, 403 for forbidden actions on visible resources, 404 for unavailable/non-visible objects, 409 for payload/idempotency conflicts, 412 for stale If-Match, 422 for schema errors and 429 for limits. Map version errors consistently; VERSION_CONFLICT above uses HTTP 412. Do not leak hidden-object existence through error details.

Route result includes result_status (FEASIBLE, NO_FEASIBLE_PATH, INSUFFICIENT_DATA), alternatives with geometry/ordered edges/travel_seconds/uncertainty, excluded reasons, data_ages, graph_version, status_version, policy_version, evaluated_at, expires_at and requires_human_review. A single ETA estimate is labelled baseline until residual data supports an interval. No route outcome says guaranteed safe.

## Offline synchronization protocol

Keep draft ID, operation ID, user identity scope, payload version, media references and client-observed timestamps in IndexedDB. Max proposed local storage budget: 100 reports and 50 MB media, configurable and tested on target devices. Warn before capacity is exhausted; never silently evict unsubmitted reports. Browser storage eviction remains possible, so communicate this limit and encourage timely sync.

States: DRAFT -> QUEUED -> UPLOADING_MEDIA -> SUBMITTING -> SYNCED. Recoverable failures enter RETRY_WAIT; expired authentication enters NEEDS_LOGIN; conflicting edits enter NEEDS_REVIEW; unrecoverable validation errors enter FAILED_WITH_REASON. Queued text-only reports skip media upload. These are client states, not verification states.

Server batch returns one result per operation: accepted, duplicate, validation_error, forbidden or conflict, plus server resource ID/version when permitted. The whole batch is not rolled back because one item fails. Each item runs in its own database transaction. Enforce unique actor/operation IDs in durable sync_results or reports, even after the short-lived response cache expires.

For identical key + identical body replay the stored result; same key + different body returns 409. Bind keys to actor and endpoint, never only a global user-supplied string. Record report/outbox/audit and operation mapping atomically. A crash after commit but before the HTTP response therefore does not duplicate the report.

Auth expiry preserves the locally queued draft but blocks replay until the same authorized user signs in. On shared devices, lock unsynced records to their identity. Logout offers submit or explicit discard and clears sensitive cached server data; unsynced personal data must not silently become visible to the next user. Client-side encryption may reduce device-storage exposure but does not defend against a compromised browser/XSS; prefer managed devices for real deployment.

## Routing and impact algorithm

1. Validate points, vehicle profile, departure time and requester access; select immutable graph/status snapshots.
2. Snap to accessible graph positions within configured tolerances, respecting direction/side/bridge ambiguity; reject unsupported snaps.
3. Exclude verified closures, provisional critical-dispatch cautions and vehicle-incompatible edges. Unknown critical bridge limits cause abstention or require explicit qualified review, not an invented default.
4. Calculate nonnegative time costs from baseline traversal plus reviewed delay/advisory penalties. All penalty weights are policy parameters with explanations, not learned probability claims.
5. Generate a bounded set of alternatives and reject near-duplicates. Return exact exclusion reasons and remaining uncertainty.
6. Join ordered route_plan_edges to changed edges, then trips to deliveries/stops and enrolled facilities. Count distinct affected entities.
7. Store recommendation snapshot and validity. Before accepting a dispatch decision, compare latest versions; if changed, recompute and require review again.

A snapshot solver is not a time-dependent optimizer. MVP arrival estimates do not model every future closure or ferry schedule; mark that limitation. Candidate paths with known restrictions during expected traversal windows require rejection or reviewed scheduling. No-path is a legitimate result.

## Reliability and nonfunctional acceptance

Proposed pilot benchmark: 100 enrolled vehicles, 15-second sample interval while connected, 50 concurrent interactive users and a corridor graph up to 50,000 edges. This is synthetic test capacity, not observed regional scale. A full day at this telemetry rate is about 576,000 positions; retention and partitioning must be sized before rollout.

Target ordinary list/detail p95 <500 ms and route evaluation p95 <3 seconds on the declared fixture/hardware, excluding external-provider delays. Target verified-incident-to-visible-impact p95 <30 seconds while healthy. Show degraded processing if this is exceeded. Choose polling intervals within provider terms; do not promise 15-second weather updates.

Initial pilot recovery objectives: RPO <=15 minutes and RTO <=4 hours, subject to actual restore drills and budget. These are targets, not attained guarantees. Make unavailable-state handling correct before chasing latency.

Acceptance must cover access isolation, zero hard-closure traversal in fixtures, exact impact counts, no duplicated durable reports on replay, visible stale data, blocked invalid transitions, private media, interrupted uploads, source outages, role-aware alerts, keyboard/list alternatives and a tested restore procedure.
