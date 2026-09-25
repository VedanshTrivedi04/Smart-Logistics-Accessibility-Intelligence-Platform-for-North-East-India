"""
HTTP end-to-end check of the NE-calibrated ETA: routing module plans a route, the AI module estimates its ETA
(NOT collected by pytest - not named test_*).

Chain: POST /routes/evaluate (Guwahati hub -> Shillong depot on the seeded pilot corridor) -> its edge ids ->
POST /ai/estimate-eta under different vehicles, terrain and rain. For a controlled setup the script temporarily
sets `road_edges.elevation_gain_m` from SRTM and inserts `edge_weather_features` rows for the route's edges in the
LOCAL test DB, then restores the previous values. Needs the local stack (see e2e_ai_http.py) and network access to
OpenTopoData. Never point this at the shared Neon DB.
"""

import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

import httpx
import numpy as np

BASE = "http://127.0.0.1:8010"
ORG, USER = "00000000-0000-4000-a000-000000000003", "d0000008-0000-4000-8000-000000000008"  # fleet manager: has COMPUTE_ROUTE
results: list[tuple[str, bool, str]] = []


def psql(sql: str) -> str:
    return subprocess.run(["docker", "exec", "ner_test_pg", "psql", "-U", "test", "-d", os.environ.get("E2E_DB", "ner_e2e"), "-Atc", sql],
                          capture_output=True, text=True, check=True).stdout.strip()


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" | {detail}" if detail else ""), flush=True)


def dem_gain_m(geojson: dict) -> float:
    """Gross ascent along an edge: SRTM every ~250 m, 5-point moving average (same treatment as the training data)."""
    pts = np.array(geojson["coordinates"])  # lon, lat
    seg = np.hypot(np.diff(pts[:, 0]) * 111320.0 * np.cos(np.radians(pts[:-1, 1])), np.diff(pts[:, 1]) * 111320.0)
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    grid = np.append(np.arange(0.0, cum[-1], 250.0), cum[-1])
    lon, lat = np.interp(grid, cum, pts[:, 0]), np.interp(grid, cum, pts[:, 1])
    z = np.full(len(grid), np.nan)
    for i in range(0, len(grid), 100):
        loc = "|".join(f"{a:.5f},{b:.5f}" for a, b in zip(lat[i:i + 100], lon[i:i + 100]))
        req = urllib.request.Request("https://api.opentopodata.org/v1/srtm30m?" + urllib.parse.urlencode({"locations": loc, "interpolation": "bilinear"}),
                                     headers={"User-Agent": "NER-Logistics-SIH2026-research/0.1"})
        for attempt in range(4):
            try:
                res = json.loads(urllib.request.urlopen(req, timeout=60).read())["results"]
                break
            except Exception:  # noqa: BLE001
                time.sleep(2 ** attempt)
        else:
            raise RuntimeError("DEM lookup failed")
        z[i:i + len(res)] = [r["elevation"] if r["elevation"] is not None else np.nan for r in res]
        time.sleep(1.1)
    idx = np.arange(len(z))
    z = np.interp(idx, idx[~np.isnan(z)], z[~np.isnan(z)])
    z = np.convolve(np.pad(z, 2, mode="edge"), np.ones(5) / 5, mode="valid")
    return float(np.clip(np.diff(z), 0, None).sum())


c = httpx.Client(base_url=BASE, timeout=180)
assert c.post("/api/v1/auth/dev-session", json={"user_id": USER, "org_id": ORG, "role": "FLEET_MANAGER"}).status_code == 200
H = {"X-CSRF-Token": c.get("/api/v1/auth/csrf-token").json()["csrf_token"]}

node = lambda name: psql(f"select nearest_road_node_id from facilities where name like '{name}%'")  # noqa: E731
origin, dest = node("Guwahati Multi-Modal"), node("Meghalaya State Health")
r = c.post("/api/v1/routes/evaluate", json={"origin_node_id": origin, "destination_node_id": dest, "max_weight_kg": 12000}, headers=H)
check("routing module plans Guwahati hub -> Shillong depot", r.status_code == 200 and r.json()["result_status"] == "FEASIBLE" and len(r.json()["edges"]) >= 1, f"{r.status_code} {r.json().get('result_status') if r.status_code == 200 else r.text[:120]}")
plan = r.json()
edge_ids = [e["edge_id"] for e in plan["edges"]]
route_km = plan["total_distance_meters"] / 1000.0
in_list = ",".join(f"'{e}'" for e in edge_ids)
print(f"  route: {len(edge_ids)} edges, {route_km:.1f} km, routing-engine duration {plan['total_duration_seconds'] / 3600:.2f} h")

original_gain = psql(f"select id||'|'||elevation_gain_m from road_edges where id in ({in_list})").splitlines()
psql(f"delete from edge_weather_features where edge_id in ({in_list})")  # controlled weather (local test DB only)
psql(f"update road_edges set elevation_gain_m = 0 where id in ({in_list})")


def eta(weight: float, ids: list[str] | None = None) -> dict:
    r = c.post("/api/v1/ai/estimate-eta", json={"edge_ids": ids or edge_ids, "max_weight_kg": weight}, headers=H)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    return r.json()


try:
    flat = eta(12000)
    check("estimate-eta uses the NE-calibrated model and discloses provenance", flat["model_status"] == "LOADED" and flat["training_data"] == "SYNTHETIC_NE_CALIBRATED", f"{flat['model_status']} / {flat['training_data']}")
    check("bounds ordered around the total", flat["lower_bound_seconds"] <= flat["total_seconds"] <= flat["upper_bound_seconds"])
    band = (flat["upper_bound_seconds"] - flat["total_seconds"]) / flat["total_seconds"]
    check("confidence band reflects the measured route-level spread (10-25 % of the total)", 0.10 <= band <= 0.25, f"+-{band * 100:.1f}%")
    speed = route_km / (flat["total_seconds"] / 3600.0)
    check("implied average speed of a 12 t truck is plausible (15-60 km/h)", 15 <= speed <= 60, f"{speed:.1f} km/h over {route_km:.0f} km")

    car, heavy = eta(1800)["total_seconds"], eta(24000)["total_seconds"]
    check("vehicle weight: car <= 12 t truck <= 24 t truck, and heavy strictly slower than car", car <= flat["total_seconds"] <= heavy and heavy > car, f"{car / 60:.0f} / {flat['total_seconds'] / 60:.0f} / {heavy / 60:.0f} min")

    # terrain: set elevation gain from SRTM for the route's edges
    total_gain = 0.0
    for eid in edge_ids:
        geo = json.loads(psql(f"select st_asgeojson(geom) from road_edges where id='{eid}'"))
        g = dem_gain_m(geo)
        total_gain += g
        psql(f"update road_edges set elevation_gain_m = {g:.1f} where id='{eid}'")
    hilly = eta(12000)
    check("terrain: elevation gain from SRTM makes the ETA longer", hilly["total_seconds"] > flat["total_seconds"] * 1.02, f"gain {total_gain:.0f} m: {flat['total_seconds'] / 3600:.2f} h -> {hilly['total_seconds'] / 3600:.2f} h")

    # rain: forecast 60 mm / 3 h = 20 mm/h on every edge of the route
    for eid in edge_ids:
        psql("insert into edge_weather_features (id, edge_id, observed_at, rainfall_24h_mm, rainfall_48h_mm, rainfall_72h_mm, ari_score, "
             f"forecast_rainfall_3h_mm, forecast_rainfall_6h_mm, forecast_rainfall_12h_mm, soil_moisture_index, created_at) values (gen_random_uuid(), '{eid}', now(), 0,0,0,0, 60, 0,0, 0.3, now())")
    wet = eta(12000)
    ratio = wet["total_seconds"] / hilly["total_seconds"]
    check("rain: 20 mm/h forecast slows the trip by 5-40 %", 1.05 <= ratio <= 1.40, f"+{(ratio - 1) * 100:.1f}%")

    bad = c.post("/api/v1/ai/estimate-eta", json={"edge_ids": ["aaaaaaaa-0000-4000-8000-000000000001"], "max_weight_kg": 12000}, headers=H)
    check("unknown edge -> clean 4xx (not 500)", 400 <= bad.status_code < 500, f"{bad.status_code} {bad.json().get('code')}")
    empty = c.post("/api/v1/ai/estimate-eta", json={"edge_ids": [], "max_weight_kg": 12000}, headers=H)
    check("empty edge list -> 422 validation error", empty.status_code == 422, str(empty.status_code))
    print(f"  summary: routing engine {plan['total_duration_seconds'] / 3600:.2f} h | AI flat {flat['total_seconds'] / 3600:.2f} h | with terrain {hilly['total_seconds'] / 3600:.2f} h | +rain {wet['total_seconds'] / 3600:.2f} h")
finally:
    psql(f"delete from edge_weather_features where edge_id in ({in_list})")
    for line in original_gain:
        eid, gain = line.split("|")
        psql(f"update road_edges set elevation_gain_m = {gain} where id='{eid}'")

fails = [x for x in results if not x[1]]
print(f"\nRESULT: {len(results) - len(fails)}/{len(results)} passed")
sys.exit(1 if fails else 0)
