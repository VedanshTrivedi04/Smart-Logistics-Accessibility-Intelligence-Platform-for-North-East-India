# Shared / Backend: network

- **Last updated:** 2026-09-25

- **Source:** backend/app/modules/network/, migration 003, application/seed_regional_network.py, contracts/fixtures/pilot_corridor_synthetic.geojson
- **Status:** done

- Endpoints: GET /network/edges (bbox), /network/edges/{id}, /network/versions; POST /network/edges/{id}/status; GET /facilities, /facilities/{id}, /facilities/{id}/reachability.
- Edge GeoJSON carries `jurisdiction_id`.
- `seed_regional_network.py` & `pilot_corridor_synthetic.geojson` (updated 2026-09-25): Physical road geometry realigned to follow authentic road curvature (Saraighat Bridge crossing over Brahmaputra river, Jalukbari Rotary, AT Road, and NH-6 Jorabat-Byrnihat winding mountain pass) instead of straight lines cutting through mountains.
- Seeds NH corridors for all 8 NE states (NH-27/29, NH-2, NH-6/306, NH-8, NH-15/415, NH-10) and Tier-1 lifeline facilities per state capital.
- Tests: `backend/tests/unit/network`.
