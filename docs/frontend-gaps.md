# Frontend ↔ portal specification: coverage and backend gaps

Source documents: `NER_Smart_Logistics_Portal_Wise_Functionality_Specification.md`, `pre-devlopment-assets/ner-project/frontendhandoever.md`, `backend/openapi.json`. No mock or dummy data is used anywhere; where the API has nothing to show, the screen says so.

Legend: **Built** = implemented against a real endpoint. **Derived** = computed in the browser from real records and labelled as such. **Gap** = needs a backend/data addition; the UI shows an honest "not available" state instead of inventing data.

## Government Command Portal (`/gov`)

| Spec item | State | Notes |
|---|---|---|
| Login and role resolution (3.1) | Built | OIDC + `/auth/callback` (multi-org choice); dev sign-in for test stacks only. MFA is an identity-provider concern. |
| Command dashboard (3.2) | Built / Derived | Connectivity, incidents, impact, logistics, vehicle and notice figures from real lists. Percentages are by length of the *imported* network and state their denominator. State/district comparison: **Gap** (no jurisdiction names). |
| Live accessibility map (3.3) | Built | Bounded viewport query, status by colour + line style, parity list, segment/facility panels, reachability, restrictions, declare status (with reason, expiry, reopen confirmation). Status **timeline**: **Gap** (API returns only current version). Weather-risk overlay: **Gap** (no weather feed). |
| Incident centre (3.4) | Built | List by lifecycle, detail with primary-report evidence, photos on demand, resolve, merge. Affected vehicles/deliveries per incident: shown via the impact board because no incident→impact endpoint exists. |
| Review workflow | Built | Claim, verify/reject/request info with `If-Match` version, anti-self-review message, 412 recovery. |
| Route intelligence (3.5) | Built | Origin/destination (facility or coordinates), vehicle constraints, alternatives, hard exclusions, policy + snapshot versions, expiry, two-policy comparison, `NO_FEASIBLE_PATH` with operator-configured escalation text, `INSUFFICIENT_DATA` as unknown. |
| Logistics & supply monitoring (3.6), vehicle monitoring (3.7) | Built | Consignments by priority tier and SLA, trips, vehicle map/detail with stale-GPS handling and breadcrumbs. Scoped to the caller's organization by the backend. |
| Alerts & notifications (3.8) | Derived | Notices from current records with stable event codes and reviewed-template wording. Delivery, acknowledgement and resolution workflow: **Gap** (no alert service). |
| Analytics & reports (3.9) | Derived | Period filter, previous-period comparison, CSV export (EXPORT_DATA). Disruption frequency, route-risk history, delay causes: **Gap** (no historical status/weather data). |
| Emergency mode (3.10) | Built | Presentation-only priority board and route planner. "Emergency type" input: not part of the routing API. |
| User management (3.11) | Gap | No identity-administration endpoints in OpenAPI (only `/me`, sessions, org selection). |

## Field Operations (`/field`)

| Spec item | State | Notes |
|---|---|---|
| Home (4.1) | Built | On-request location, assignment (jurisdiction count), queue and nearby summary, notices. Assignment *names*: **Gap**. |
| Report incident (4.2) | Built | 5-step wizard: type, location (GPS / manual coordinates / map tap), photos + description, severity, review. Draft persisted before "saved on device". |
| Road/bridge update (4.3) | Built | Nearby segments; declare status where the role allows, otherwise report. |
| My reports (4.4) | Built | Local *Saved on device* states merged with server review states; amendment. |
| Nearby incidents (4.5) | Derived | Reports and non-open segments within 5 km (incident records carry no location). |
| Field alerts (4.6) | Derived | As above; "verification requested" from `MORE_INFO_NEEDED`. |
| Offline mode & sync (4.7) | Built | See `frontend/README.md`. |
| Profile & assignments (4.8) | Partial | Identity, language, low-bandwidth. Assigned inspections/incidents: **Gap**. |

## Logistics & Transport (`/logistics`)

| Spec item | State |
|---|---|
| Dashboard, live fleet map, vehicle detail, delivery list/detail, route alternatives + dispatch decision, fleet management (vehicle, driver, consignment, trip forms), history/performance, alerts | Built / Derived |
| Operator/driver mobile view (5.8) | Gap — `TRANSPORT_OPERATOR` has no fleet permission and there is no "my trip" endpoint; the portal explains this. |
| Delay *reasons* in history | Gap — not stored by the API. |

Public/citizen interface: intentionally not built (handover: no public route or unauthenticated map in the MVP).

## Recommended backend additions (in priority order)

1. **Live `status_version` on `GET /network/versions`** so a recommendation can be marked outdated as soon as road status changes (today only the decision call re-checks it).
2. **SSE (or long-poll) event stream with cursor + resync** and an **alerts resource** with delivery/acknowledgement states (spec 3.8, T15/T18).
3. **Aggregate endpoints:** counts of edges by status per jurisdiction, incident/report counts, facility impacts and trip impacts across a scope (replaces per-facility / per-trip requests; removes truncation).
4. **Jurisdiction directory** (`id → name/level`), and incident → location / affected edges / affected trips.
5. **Road status history per edge** (timeline, spec 3.3) and route-risk history.
6. **Bulk latest vehicle positions** (one call instead of one per vehicle) and an "assigned trip for me" endpoint for drivers.
7. **Identity administration** (users, roles, scope, audit) for spec 3.11.
8. **Weather/CAP source-health and risk layer** (T13) and licensed tile endpoint.
9. `OIDC_REDIRECT_URI` must point at the frontend `/auth/callback` (configuration, no code change).
10. The OpenAPI schema types `items` of `POST /reports/sync` and the sync response arrays as untyped objects; typing them would remove one cast in `src/features/field/sync/transport.ts`.
