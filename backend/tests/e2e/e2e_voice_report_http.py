"""
HTTP end-to-end check of POST /api/v1/ai/voice-report (NOT collected by pytest - not named test_*).

Needs the LOCAL stack described in e2e_ai_http.py, plus the API started with real Bhashini keys
(backend/bhashini.env) and a Hindi sample WAV at ml-training/data/bhashini_sample_hi.wav
(generated once with Bhashini TTS). Never point this at the shared Neon DB.
"""
import os
import subprocess
import sys
import uuid
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8010"
WAV = Path(__file__).resolve().parents[3] / "ml-training" / "data" / "bhashini_sample_hi.wav"
FIELD_ORG, FIELD_USER = "00000000-0000-4000-a000-000000000002", "d0000005-0000-4000-8000-000000000005"
LOGI_ORG, LOGI_USER = "00000000-0000-4000-a000-000000000003", "d0000008-0000-4000-8000-000000000008"
results: list[tuple[str, bool, str]] = []


def psql(sql: str) -> str:
    return subprocess.run(["docker", "exec", "ner_test_pg", "psql", "-U", "test", "-d", os.environ.get("E2E_DB", "ner_e2e"), "-Atc", sql],
                          capture_output=True, text=True, check=True).stdout.strip()


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" | {detail}" if detail else ""), flush=True)


def session(user: str, org: str, role: str) -> tuple[httpx.Client, dict[str, str]]:
    c = httpx.Client(base_url=BASE, timeout=180)
    r = c.post("/api/v1/auth/dev-session", json={"user_id": user, "org_id": org, "role": role})
    assert r.status_code == 200, r.text
    return c, {"X-CSRF-Token": c.get("/api/v1/auth/csrf-token").json()["csrf_token"]}


def post(c, h, data: dict, audio: bytes | None = None):  # type: ignore[no-untyped-def]
    base = {"source_language": "hi", "latitude": "26.065", "longitude": "91.870", "accuracy_m": "10"}
    return c.post("/api/v1/ai/voice-report", files={"file": ("note.wav", audio or WAV.read_bytes(), "audio/wav")},
                  data={**base, **data}, headers=h)


c, h = session(FIELD_USER, FIELD_ORG, "FIELD_OFFICER")
before = int(psql("select count(*) from reports"))

r = post(c, h, {})
j = r.json()
check("voice-report 201 (real Bhashini ASR+translation)", r.status_code == 201, f"{r.status_code} {str(j)[:150]}")
if r.status_code == 201:
    check("type inferred as LANDSLIDE and flagged", j["report_type"] == "LANDSLIDE" and j["inferred_fields"]["report_type"])
    check("severity defaulted to MEDIUM (never inferred) and flagged", j["severity"] == "MEDIUM" and j["inferred_fields"]["severity"])
    check("enters human review (SUBMITTED)", j["review_state"] == "SUBMITTED", j["review_state"])
    check("snapped to a road edge", j["candidate_edge_id"] is not None)
    check("description has provenance + English + original", j["description"].startswith("[Voice report") and "landslide" in j["description"].lower() and "Original (hi)" in j["description"])
    check("row persisted in DB", psql(f"select count(*) from reports where id='{j['report_id']}'") == "1")

op = f"voice-e2e-{uuid.uuid4().hex[:8]}"
a = post(c, h, {"client_operation_id": op}); b = post(c, h, {"client_operation_id": op})
check("idempotent replay returns same report, replayed=true, no new ASR text",
      a.status_code == 201 and b.status_code == 201 and a.json()["report_id"] == b.json()["report_id"] and b.json()["replayed"] and b.json()["transcribed_text"] is None,
      f"{a.status_code}/{b.status_code}")

r = post(c, h, {"severity": "HIGH"})
check("HIGH severity without explicit type -> 400 INVALID_VOICE_REPORT", r.status_code == 400 and r.json().get("code") == "INVALID_VOICE_REPORT", f"{r.status_code} {r.json().get('code')}")
r = post(c, h, {"severity": "HIGH", "report_type": "LANDSLIDE"})
check("explicit HIGH+LANDSLIDE -> PROVISIONAL_CAUTION (Policy 21)", r.status_code == 201 and r.json()["review_state"] == "PROVISIONAL_CAUTION", f"{r.status_code} {r.json().get('review_state')}")
r = post(c, h, {"latitude": "10.0", "longitude": "70.0"})
check("location outside NER -> 400, before ASR", r.status_code == 400 and r.json().get("code") == "INVALID_VOICE_REPORT", f"{r.status_code} {r.json().get('code')}")

n0 = int(psql("select count(*) from reports"))
r = post(c, h, {"source_language": "as"})
check("Assamese voice (no ASR in Bhashini) -> 422 UNSUPPORTED_LANGUAGE", r.status_code == 422 and r.json().get("code") == "UNSUPPORTED_LANGUAGE", f"{r.status_code} {r.json().get('code')}")
r = post(c, h, {}, audio=b"this is not audio at all")
check("garbage audio -> clean 4xx/502, never 500", r.status_code in (422, 502), f"{r.status_code} {r.json().get('code')}")
check("failed requests created no reports", int(psql("select count(*) from reports")) == n0)

noauth = httpx.post(BASE + "/api/v1/ai/voice-report", files={"file": ("n.wav", b"x", "audio/wav")},
                    data={"source_language": "hi", "latitude": "26", "longitude": "91.8", "accuracy_m": "10"})
check("unauthenticated -> 401", noauth.status_code == 401, str(noauth.status_code))
c2, h2 = session(LOGI_USER, LOGI_ORG, "FLEET_MANAGER")
r = post(c2, h2, {})
check("role without SUBMIT_REPORT -> 403", r.status_code == 403, f"{r.status_code} {r.json().get('code')}")

check("total reports created = only the successful ones", int(psql("select count(*) from reports")) == before + 3, f"{int(psql('select count(*) from reports')) - before} new")
fails = [x for x in results if not x[1]]
print(f"\nRESULT: {len(results) - len(fails)}/{len(results)} passed")
sys.exit(1 if fails else 0)
