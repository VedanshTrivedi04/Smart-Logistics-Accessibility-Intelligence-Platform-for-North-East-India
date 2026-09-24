# Shared / Backend: hazard

- **Last updated:** 2026-09-24

- **Source:** backend/app/modules/hazard/, migration 007
- **Status:** done

- GET /hazard/risk-zones (bbox); POST /hazard/risk-zones/refresh (live rainfall -> recompute landslide risk), /risk-zones/seed (derive from steep edges). Public read at /public/hazard/risk-zones.
