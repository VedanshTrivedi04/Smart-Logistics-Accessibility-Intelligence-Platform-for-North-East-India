"""
HTTP end-to-end check of POST /api/v1/ai/translate-text and /api/v1/ai/text-report (NOT collected by
pytest - not named test_*). Same LOCAL stack and real-Bhashini server as e2e_voice_report_http.py.
Never point this at the shared Neon DB.
"""

import subprocess
import sys
import uuid

import httpx

BASE = "http://127.0.0.1:8010"
FIELD_ORG, FIELD_USER = "00000000-0000-4000-a000-000000000002", "d0000005-0000-4000-8000-000000000005"
LOGI_ORG, LOGI_USER = "00000000-0000-4000-a000-000000000003", "d0000008-0000-4000-8000-000000000008"
ASSAMESE = "ৰাস্তাত ভূমিধস হৈছে আৰু গাড়ী যাব নোৱাৰে"  # landslide on the road, vehicles cannot pass
NEPALI_BRIDGE = "पुल भत्किएको छ र गाडी जान सक्दैन"  # the bridge has collapsed, vehicles cannot pass
results: list[tuple[str, bool, str]] = []


def psql(sql: str) -> str:
    return subprocess.run(
        ["docker", "exec", "ner_test_pg", "psql", "-U", "test", "-d", "ner_test", "-Atc", sql],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" | {detail}" if detail else ""), flush=True)


def session(user: str, org: str, role: str):  # type: ignore[no-untyped-def]
    c = httpx.Client(base_url=BASE, timeout=180)
    assert c.post("/api/v1/auth/dev-session", json={"user_id": user, "org_id": org, "role": role}).status_code == 200
    return c, {"X-CSRF-Token": c.get("/api/v1/auth/csrf-token").json()["csrf_token"]}


def report(c, h, **over):  # type: ignore[no-untyped-def]
    body = {"text": ASSAMESE, "source_language": "as", "latitude": 26.065, "longitude": 91.870, "accuracy_m": 10}
    return c.post("/api/v1/ai/text-report", json={**body, **over}, headers=h)


c, h = session(FIELD_USER, FIELD_ORG, "FIELD_OFFICER")
before = int(psql("select count(*) from reports"))

r = c.post("/api/v1/ai/translate-text", json={"text": ASSAMESE, "source_language": "as"}, headers=h)
check("translate-text Assamese -> English (real Bhashini)", r.status_code == 200 and "landslide" in r.json()["translated_text"].lower(), f"{r.status_code} {r.json().get('translated_text')}")
r = c.post("/api/v1/ai/translate-text", json={"text": NEPALI_BRIDGE, "source_language": "ne"}, headers=h)
check("translate-text Nepali -> English", r.status_code == 200 and r.json()["model_status"] == "LOADED", f"{r.status_code} {r.json().get('translated_text')}")
r = c.post("/api/v1/ai/translate-text", json={"text": "x", "source_language": "kha"}, headers=h)
check("translate-text Khasi (unsupported) -> 422 UNSUPPORTED_LANGUAGE", r.status_code == 422 and r.json().get("code") == "UNSUPPORTED_LANGUAGE", f"{r.status_code} {r.json().get('code')}")
r = c.post("/api/v1/ai/translate-text", json={"text": "", "source_language": "as"}, headers=h)
check("translate-text empty text -> 422 validation error", r.status_code == 422, str(r.status_code))

r = report(c, h)
j = r.json()
check("text-report Assamese -> 201", r.status_code == 201, f"{r.status_code} {str(j)[:120]}")
if r.status_code == 201:
    check("type inferred LANDSLIDE + flagged; severity defaulted MEDIUM + flagged",
          j["report_type"] == "LANDSLIDE" and j["inferred_fields"] == {"report_type": True, "severity": True} and j["severity"] == "MEDIUM")
    check("enters human review (SUBMITTED) and snapped to an edge", j["review_state"] == "SUBMITTED" and j["candidate_edge_id"] is not None)
    check("description: provenance tag + English + original Assamese",
          j["description"].startswith("[Text report - machine-translated, unverified]") and "landslide" in j["description"].lower() and ASSAMESE in j["description"])
    check("row persisted in DB", psql(f"select count(*) from reports where id='{j['report_id']}'") == "1")

op = f"text-e2e-{uuid.uuid4().hex[:8]}"
a, b = report(c, h, client_operation_id=op), report(c, h, client_operation_id=op)
check("idempotent replay: same report, replayed=true, no translation text",
      a.status_code == 201 and b.status_code == 201 and a.json()["report_id"] == b.json()["report_id"] and b.json()["replayed"] and b.json()["transcribed_text"] is None)

r = report(c, h, text=NEPALI_BRIDGE, source_language="ne", report_type="BRIDGE_COLLAPSE", severity="HIGH")
check("explicit BRIDGE_COLLAPSE + HIGH -> PROVISIONAL_CAUTION (Policy 21)", r.status_code == 201 and r.json()["review_state"] == "PROVISIONAL_CAUTION", f"{r.status_code} {r.json().get('review_state')}")
r = report(c, h, severity="CRITICAL")
check("CRITICAL without explicit type -> 400 INVALID_VOICE_REPORT", r.status_code == 400 and r.json().get("code") == "INVALID_VOICE_REPORT", f"{r.status_code} {r.json().get('code')}")
r = report(c, h, latitude=10.0, longitude=70.0)
check("location outside NER -> 400", r.status_code == 400, str(r.status_code))
r = report(c, h, report_type="NOT_A_TYPE")
check("invalid enum value -> 422 validation error", r.status_code == 422, str(r.status_code))

n0 = int(psql("select count(*) from reports"))
r = report(c, h, text="Ka lynti la kha", source_language="kha")
check("Khasi text-report -> 422 UNSUPPORTED_LANGUAGE, nothing saved", r.status_code == 422 and int(psql("select count(*) from reports")) == n0, f"{r.status_code} {r.json().get('code')}")

noauth = httpx.post(BASE + "/api/v1/ai/text-report", json={"text": "abc", "source_language": "as", "latitude": 26, "longitude": 91.8, "accuracy_m": 10})
check("unauthenticated -> 401", noauth.status_code == 401, str(noauth.status_code))
r = c.post("/api/v1/ai/text-report", json={"text": ASSAMESE, "source_language": "as", "latitude": 26.065, "longitude": 91.87, "accuracy_m": 10})
check("missing CSRF header -> 403", r.status_code == 403, str(r.status_code))
c2, h2 = session(LOGI_USER, LOGI_ORG, "FLEET_MANAGER")
check("role without SUBMIT_REPORT -> 403", report(c2, h2).status_code == 403)

created = int(psql("select count(*) from reports")) - before
check("only the successful requests created reports (Assamese, replay-once, Nepali HIGH)", created == 3, f"{created} new")
fails = [x for x in results if not x[1]]
print(f"\nRESULT: {len(results) - len(fails)}/{len(results)} passed")
sys.exit(1 if fails else 0)
