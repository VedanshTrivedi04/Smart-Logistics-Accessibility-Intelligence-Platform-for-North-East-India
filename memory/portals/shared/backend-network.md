# Shared / Backend: network

- **Last updated:** 2026-09-24

- **Source:** backend/app/modules/network/, migration 003, application/seed_regional_network.py
- **Status:** done

- Endpoints: GET /network/edges (bbox), /network/edges/{id}, /network/versions; POST /network/edges/{id}/status; GET /facilities, /facilities/{id}, /facilities/{id}/reachability.
- Edge GeoJSON now carries `jurisdiction_id` (2026-09-24).
- `seed_regional_network.py` (new): fixes Guwahati-Shillong geometry (edge 107 Nongpoh spur), seeds NH corridors for all 8 NE states (NH-27/29, NH-2, NH-6/306, NH-8, NH-15/415, NH-10) and Tier-1 lifeline facilities per state capital.
- Tests: `backend/tests/unit/network`.
