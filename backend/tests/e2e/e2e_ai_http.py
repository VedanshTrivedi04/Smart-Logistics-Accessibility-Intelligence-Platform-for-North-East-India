"""
HTTP end-to-end check of the /api/v1/ai endpoints (NOT collected by pytest - not named test_*).

Needs: a LOCAL seeded Postgres (docker container ner_test_pg on :55432, API database `ner_e2e` (E2E_DB), PostGIS+pgRouting, SSL on,
alembic upgrade head + seed_demo/load_pilot_corridor/seed_fleet_demo/seed_reporting_demo) and the API
running on :8010 with USE_MOCK_STORAGE=true and the LOCAL DATABASE_URL. Never point it at the shared Neon DB.
"""
import glob
import os
import subprocess
import sys

import httpx

BASE = "http://127.0.0.1:8010"
GOV_ORG = "00000000-0000-4000-a000-000000000001"
GOV_USER = "d0000001-0000-4000-8000-000000000001"
results: list[tuple[str, bool, str]] = []


def psql(sql: str) -> list[str]:
    out = subprocess.run(["docker", "exec", "ner_test_pg", "psql", "-U", "test", "-d", os.environ.get("E2E_DB", "ner_e2e"), "-Atc", sql],
                         capture_output=True, text=True, check=True).stdout.strip()
    return [line for line in out.splitlines() if line]


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" | {detail}" if detail else ""), flush=True)


c = httpx.Client(base_url=BASE, timeout=120)

r = c.get("/health/live"); check("health live", r.status_code == 200, str(r.status_code))
r = c.get("/health/ready"); check("health ready (db)", r.status_code == 200, r.text[:120])

r = c.post("/api/v1/auth/dev-session", json={"user_id": GOV_USER, "org_id": GOV_ORG, "role": "REGIONAL_AUTHORITY"})
check("dev-session login", r.status_code == 200, str(r.status_code) + " " + r.text[:100])
r = c.get("/api/v1/auth/csrf-token")
csrf = (r.json().get("csrf_token") or r.json().get("token") or "") if r.status_code == 200 else ""
check("csrf token", bool(csrf), str(r.status_code))
H = {"X-CSRF-Token": csrf}
r = c.get("/api/v1/me"); check("/me returns principal", r.status_code == 200 and "REGIONAL" in r.text, str(r.status_code))

edges = psql("select id from road_edges order by edge_index limit 4")
check("seed edges present", len(edges) >= 3, f"{len(edges)} edges")

# 1. predict-risk -------------------------------------------------------------------------------
high = {"slope_pct": 45.0, "elevation_mean_m": 1500.0, "curvature_index": 10.0, "rainfall_72h_mm": 200.0,
        "ari_score": 120.0, "soil_moisture_index": 0.5}
low = {"slope_pct": 3.0, "elevation_mean_m": 60.0, "curvature_index": 0.0, "rainfall_72h_mm": 0.0,
       "ari_score": 0.0, "soil_moisture_index": 0.3}
ph = c.post("/api/v1/ai/predict-risk", json={"edge_id": edges[0], "horizon": "H24", "features": high}, headers=H)
pl = c.post("/api/v1/ai/predict-risk", json={"edge_id": edges[0], "horizon": "H24", "features": low}, headers=H)
check("predict-risk 200 (high/low)", ph.status_code == 200 and pl.status_code == 200, f"{ph.status_code}/{pl.status_code}")
if ph.status_code == 200 and pl.status_code == 200:
    a, b = ph.json(), pl.json()
    check("predict-risk real model LOADED", a["model_status"] == "LOADED", a["model_status"])
    check("predict-risk high > low", a["probability"] > b["probability"], f"{a['probability']:.3f} vs {b['probability']:.3f}")
    check("predict-risk probability in (0,1)", 0 < b["probability"] < a["probability"] < 1)
    check("predict-risk SHAP top contributions", len(a["top_contributions"]) >= 1, a["top_contributions"][0]["feature_name"])
bad = c.post("/api/v1/ai/predict-risk", json={"edge_id": edges[0], "horizon": "H24", "features": {"slope_pct": 1.0}}, headers=H)
check("predict-risk missing features -> clean 4xx (not 500)", 400 <= bad.status_code < 500, f"{bad.status_code} {bad.text[:90]}")
bare = psql("select id from road_edges where id not in (select edge_id from edge_terrain_features) limit 1")
nf = c.post("/api/v1/ai/predict-risk", json={"edge_id": (bare or edges)[-1], "horizon": "H24"}, headers=H)
check("predict-risk empty feature store -> clean 4xx (not 500)", 400 <= nf.status_code < 500, f"{nf.status_code} {nf.text[:90]}")
noauth = httpx.post(BASE + "/api/v1/ai/predict-risk", json={"edge_id": edges[0], "features": high})
check("predict-risk unauthenticated rejected", noauth.status_code in (401, 403), str(noauth.status_code))
nocsrf = c.post("/api/v1/ai/predict-risk", json={"edge_id": edges[0], "features": high})
check("predict-risk without CSRF rejected", nocsrf.status_code in (401, 403), str(nocsrf.status_code))

# 2. estimate-eta ---------------------------------------------------------------------------------
r = c.post("/api/v1/ai/estimate-eta", json={"edge_ids": edges[:3]}, headers=H)
if r.status_code == 200:
    j = r.json()
    check("estimate-eta 200 and ordered bounds", j["lower_bound_seconds"] <= j["total_seconds"] <= j["upper_bound_seconds"] and j["total_seconds"] > 0, str({k: round(v, 1) if isinstance(v, float) else v for k, v in j.items()}))
else:
    check("estimate-eta", False, f"{r.status_code} {r.text[:200]}")

# 3. optimize-dispatch ----------------------------------------------------------------------------
com = psql("select id from delivery_commitments where status not in ('DELIVERED','CANCELLED') limit 5")
veh = psql("select id from vehicles where is_active limit 3")
dep = psql("select origin_facility_id from delivery_commitments where origin_facility_id is not null limit 1")
check("seed commitments/vehicles present", bool(com) and bool(veh) and bool(dep), f"{len(com)} commitments, {len(veh)} vehicles")
if com and veh and dep:
    r = c.post("/api/v1/ai/optimize-dispatch", json={"depot_facility_id": dep[0], "commitment_ids": com, "vehicle_ids": veh}, headers=H)
    if r.status_code == 200:
        j = r.json(); served = sum(len(x["commitment_ids"]) for x in j["routes"]); un = len(j["unassigned_commitment_ids"])
        check("optimize-dispatch every commitment routed or reported", served + un == len(com), f"served={served} unassigned={un}")
    else:
        check("optimize-dispatch", False, f"{r.status_code} {r.text[:200]}")

# 4. verify-photo: the whole held-out TEST split through HTTP (real landslide model) ------------------
TEST_DIR = "C:/SIH 2026/Smart-Logistics-Accessibility-Intelligence-Platform-for-North-East-India/ml-training/data/real_cv/merged_v3/test"
imgs = sorted(glob.glob(TEST_DIR + "/images/*"))
tp = fp = fn = tn = 0
first = None
for f in imgs:
    stem = f.replace("\\", "/").split("/")[-1].rsplit(".", 1)[0]
    truth = open(f"{TEST_DIR}/labels/{stem}.txt").read().strip() != ""
    r = c.post("/api/v1/ai/verify-photo", files={"file": (stem + ".jpg", open(f, "rb"), "image/jpeg")}, headers=H)
    if r.status_code != 200:
        check("verify-photo 200 on every test image", False, f"{r.status_code} {r.text[:100]}")
        break
    j = r.json()
    first = first or j
    hit = j["hazard_detected"]
    tp += hit and truth
    fp += hit and not truth
    fn += (not hit) and truth
    tn += (not hit) and not truth
else:
    P, R, FA = tp / max(tp + fp, 1), tp / max(tp + fn, 1), fp / max(fp + tn, 1)
    check(f"verify-photo 200 on all {len(imgs)} test images", True, f"tp={tp} fp={fp} fn={fn} tn={tn}")
    check("verify-photo precision >= 0.85 and recall >= 0.90 (real model over HTTP)", P >= 0.85 and R >= 0.90, f"P={P:.3f} R={R:.3f} false_alarm={FA:.3f}")
    check("verify-photo discloses model coverage (LANDSLIDE only)", first["detectable_classes"] == ["LANDSLIDE"], str(first["detectable_classes"]))
r = c.post("/api/v1/ai/verify-photo", files={"file": ("x.jpg", b"not-an-image", "image/jpeg")}, headers=H)
check("verify-photo garbage bytes -> clean 4xx (not 500)", 400 <= r.status_code < 500, f"{r.status_code} {r.text[:100]}")

# 5. transcribe-voice (Bhashini not configured locally -> stub path) ---------------------------------
r = c.post("/api/v1/ai/transcribe-voice", files={"file": ("a.wav", b"RIFF....WAVE", "audio/wav")}, data={"source_language": "hi", "target_language": "en"}, headers=H)
check("transcribe-voice with fake audio -> stub 200, or clean 422/502 with real Bhashini (never 500)", r.status_code in (200, 422, 502), f"{r.status_code} {r.text[:120]}")

fails = [x for x in results if not x[1]]
print(f"\nRESULT: {len(results) - len(fails)}/{len(results)} passed")
sys.exit(1 if fails else 0)
