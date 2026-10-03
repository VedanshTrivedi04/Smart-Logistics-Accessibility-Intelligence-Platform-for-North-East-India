# Shared / Backend: network

- **Last updated:** 2026-09-27

- **Source:** backend/app/modules/network/, migration 003, application/seed_regional_network.py, contracts/fixtures/pilot_corridor_synthetic.geojson
- **Status:** done

- Endpoints: GET /network/edges (bbox), /network/edges/{id}, /network/versions; POST /network/edges/{id}/status; GET /facilities, /facilities/{id}, /facilities/{id}/reachability.
- `DeclareEdgeStatusUseCase` takes an optional `on_status_changed` callback (`EdgeStatusChangeNotification`), invoked after a successful status change so ANY caller — not just this module's own router endpoint — can emit the `edge_status.updated` outbox event. `make_edge_status_outbox_notifier(incident_repo)` is located in `application/declare_edge_status.py` so other modules can import it cleanly. It is wired into `network/api/router.py`, `inspection/api/router.py`, and `incidents/api/router.py` (`review_report` and `resolve_incident`).
- Edge GeoJSON carries `jurisdiction_id`.
- `seed_regional_network.py`: Comprehensive dense North-East regional road network covering all 8 states (Assam, Meghalaya, Arunachal Pradesh, Nagaland, Manipur, Mizoram, Tripura, Sikkim). 175 nodes, 198 bidirectional edges with realistic terrain curvature geometries, and 36 critical facilities. All edges seeded with initial OPEN status.
- Seeds NH corridors for all 8 NE states (NH-27/29, NH-2, NH-6/306, NH-8, NH-15/415, NH-10, NH-13, NH-102, NH-54) and Tier-1 lifeline facilities per state capital and border node.
- Tests: `backend/tests/unit/network`, `backend/tests/integration/incidents/test_incident_resolution_recalc.py`, `backend/tests/integration/routing/test_pgrouting_constraints.py`.
