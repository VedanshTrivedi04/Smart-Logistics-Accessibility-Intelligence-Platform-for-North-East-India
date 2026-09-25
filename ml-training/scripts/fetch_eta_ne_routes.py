"""
ml-training/scripts/fetch_eta_ne_routes.py — real NE road geometry + terrain + rainfall for ETA data.

For each origin-destination pair (real NE corridors, incl. reverse direction later) it fetches:
  * road geometry + OSRM per-node distance/duration (OpenStreetMap roads; public OSRM demo server,
    <= 1 request/second). OSRM *durations* are NOT used as truth - in NE hills they are 2-3x too
    optimistic (verified: Guwahati-Shillong 1.29 h vs ~3 h typical). Only geometry, distance and the
    OSRM speed as a road-class hint are used.
  * elevation every 250 m along the path (SRTM 30 m via OpenTopoData, <= 1 req/s, 100 points/req),
    smoothed later; and
  * real hourly rainfall (Open-Meteo archive) at the corridor midpoint for sampled dates.
Everything is cached under data/eta_ne/cache, so re-runs are cheap and rate limits are respected.

Output: data/eta_ne/routes.pkl (piece tables per corridor, 250 m pieces).

    python scripts/fetch_eta_ne_routes.py [--limit N]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pickle
import random
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "eta_ne"
CACHE = OUT / "cache"
PIECE_M = 250.0
HEADING_STEP_M = 50.0
UA = {"User-Agent": "NER-Logistics-SIH2026-research/0.1 (student project)"}

# (name, (lat, lon), (lat, lon), is_anchor). Coordinates of town centres.
PLACES = {
    "Guwahati": (26.1445, 91.7362), "Shillong": (25.5788, 91.8933), "Siliguri": (26.7271, 88.4300),
    "Gangtok": (27.3314, 88.6138), "Dimapur": (25.9044, 93.7267), "Kohima": (25.6751, 94.1086),
    "Imphal": (24.8170, 93.9368), "Aizawl": (23.7271, 92.7176), "Agartala": (23.8315, 91.2868),
    "Silchar": (24.8333, 92.7789), "Itanagar": (27.0844, 93.6053), "Tezpur": (26.6338, 92.8000),
    "Jorhat": (26.7509, 94.2037), "Dibrugarh": (27.4728, 94.9120), "Tura": (25.5138, 90.2022),
    "Jowai": (25.4500, 92.2000), "Haflong": (25.1667, 93.0167), "Bomdila": (27.2646, 92.4157),
    "Mokokchung": (26.3221, 94.5153), "Wokha": (26.0960, 94.2590), "Churachandpur": (24.3333, 93.6833),
    "Ukhrul": (25.1167, 94.3667), "Lunglei": (22.8833, 92.7333), "Nagaon": (26.3500, 92.6800),
    "Diphu": (25.8422, 93.4319), "Kalimpong": (27.0600, 88.4700), "Mangan": (27.5100, 88.5300),
    "Namchi": (27.1667, 88.3500), "Jorethang": (27.1000, 88.2700), "Kaziranga": (26.5800, 93.1700),
    "Sonapur": (26.0700, 91.9700), "Nongstoin": (25.5200, 91.2600), "Cherrapunji": (25.2700, 91.7300),
    "Byrnihat": (26.0200, 91.8700), "Mairang": (25.5700, 91.6300), "Golaghat": (26.5200, 93.9600),
    "Lumding": (25.7500, 93.1700), "Kailashahar": (24.3333, 92.0167), "Udaipur": (23.5333, 91.4833),
    "Champhai": (23.4600, 93.3300), "Tawang": (27.5860, 91.8594), "Pasighat": (28.0700, 95.3300),
    "Ziro": (27.5450, 93.8300), "Bongaigaon": (26.4800, 90.5600), "Tinsukia": (27.4900, 95.3600),
}
ANCHOR_PAIRS = [("Guwahati", "Shillong"), ("Siliguri", "Gangtok"), ("Dimapur", "Kohima"), ("Guwahati", "Dimapur")]
OTHER_PAIRS = [
    ("Shillong", "Cherrapunji"), ("Shillong", "Jowai"), ("Shillong", "Nongstoin"), ("Shillong", "Tura"),
    ("Guwahati", "Tezpur"), ("Guwahati", "Nagaon"), ("Guwahati", "Byrnihat"), ("Guwahati", "Bongaigaon"),
    ("Guwahati", "Jorhat"), ("Jorhat", "Dibrugarh"), ("Dibrugarh", "Tinsukia"), ("Dimapur", "Wokha"),
    ("Wokha", "Mokokchung"), ("Kohima", "Imphal"), ("Kohima", "Ukhrul"), ("Imphal", "Churachandpur"),
    ("Silchar", "Aizawl"), ("Silchar", "Haflong"), ("Aizawl", "Champhai"), ("Aizawl", "Lunglei"),
    ("Agartala", "Udaipur"), ("Agartala", "Kailashahar"), ("Siliguri", "Kalimpong"), ("Gangtok", "Mangan"),
    ("Siliguri", "Namchi"), ("Namchi", "Jorethang"), ("Tezpur", "Bomdila"), ("Bomdila", "Tawang"),
    ("Tezpur", "Itanagar"), ("Itanagar", "Ziro"), ("Nagaon", "Diphu"), ("Diphu", "Lumding"),
    ("Jorhat", "Golaghat"), ("Kaziranga", "Jorhat"), ("Tinsukia", "Pasighat"), ("Guwahati", "Sonapur"),
    ("Sonapur", "Jowai"), ("Kohima", "Mokokchung"), ("Silchar", "Imphal"), ("Gangtok", "Kalimpong"),
]


def _cached_json(url: str, key: str, min_gap: float = 1.1) -> dict:
    path = CACHE / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                data = json.loads(r.read())
            path.write_text(json.dumps(data))
            time.sleep(min_gap)
            return data
        except Exception as exc:  # noqa: BLE001
            print(f"  retry {attempt + 1} ({type(exc).__name__})", flush=True)
            time.sleep(min(60, 3 * 2**attempt))
    raise RuntimeError(f"failed: {url[:90]}")


def haversine_m(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371000.0 * np.arcsin(np.sqrt(a))


def osrm_route(a: tuple[float, float], b: tuple[float, float]) -> dict:
    coords = f"{a[1]:.5f},{a[0]:.5f};{b[1]:.5f},{b[0]:.5f}"
    url = f"https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson&annotations=distance,duration"
    d = _cached_json(url, "osrm_" + hashlib.md5(coords.encode()).hexdigest())
    if d.get("code") != "Ok":
        raise RuntimeError(f"OSRM {d.get('code')} for {coords}")
    return d["routes"][0]


def resample(lat, lon, step_m):
    """Resample a polyline to uniform spacing; returns (lat, lon, cumulative_distance_m of the ORIGINAL nodes)."""
    seg = haversine_m(lat[:-1], lon[:-1], lat[1:], lon[1:])
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    grid = np.arange(0.0, cum[-1], step_m)
    grid = np.append(grid, cum[-1])
    return np.interp(grid, cum, lat), np.interp(grid, cum, lon), grid, cum


def heading_change_deg_per_km(lat, lon, window_m=1000.0):
    """Small-scale curvature: absolute heading change per km, on a 50 m resample."""
    dy = np.diff(lat) * 111320.0
    dx = np.diff(lon) * 111320.0 * np.cos(np.radians(lat[:-1]))
    heading = np.degrees(np.arctan2(dx, dy))
    dh = np.abs((np.diff(heading) + 180.0) % 360.0 - 180.0)
    dh = np.concatenate([[0.0], dh])
    w = max(1, int(window_m / HEADING_STEP_M))
    return np.convolve(dh, np.ones(w), mode="same") / (w * HEADING_STEP_M / 1000.0)


def elevations(lat, lon) -> np.ndarray:
    out = np.full(len(lat), np.nan)
    for i in range(0, len(lat), 100):
        loc = "|".join(f"{la:.5f},{lo:.5f}" for la, lo in zip(lat[i:i + 100], lon[i:i + 100]))
        url = "https://api.opentopodata.org/v1/srtm30m?" + urllib.parse.urlencode({"locations": loc, "interpolation": "bilinear"})
        d = _cached_json(url, "dem_" + hashlib.md5(loc.encode()).hexdigest())
        for j, r in enumerate(d["results"]):
            if r["elevation"] is not None:
                out[i + j] = r["elevation"]
    if np.isnan(out).all():
        raise RuntimeError("no DEM values")
    idx = np.arange(len(out))
    good = ~np.isnan(out)
    return np.interp(idx, idx[good], out[good])


def rain_samples(lat: float, lon: float, seed: int, n_dates: int = 10) -> list[dict]:
    """Real hourly precipitation at the midpoint on sampled dates (monsoon-weighted)."""
    rng = random.Random(seed)
    months = [6, 7, 8, 9, 6, 7, 8, 9, 5, 10, 3, 12]  # ~2/3 monsoon, rest shoulder/dry season
    samples = []
    for _ in range(n_dates):
        y, m = rng.randint(2015, 2023), rng.choice(months)
        day = f"{y}-{m:02d}-{rng.randint(1, 28):02d}"
        url = (f"https://archive-api.open-meteo.com/v1/archive?latitude={lat:.3f}&longitude={lon:.3f}"
               f"&start_date={day}&end_date={day}&hourly=precipitation&timezone=UTC")
        try:
            h = _cached_json(url, "rain_" + hashlib.md5(url.encode()).hexdigest(), min_gap=0.2)["hourly"]["precipitation"]
        except RuntimeError:
            continue
        h = [v or 0.0 for v in h]
        hour = int(np.argmax(h)) if rng.random() < 0.5 else rng.randint(6, 20)
        samples.append({"date": day, "hour": hour, "rain_mm_hr": float(h[hour])})
    return samples


def build_corridor(name: str, a: tuple[float, float], b: tuple[float, float], anchor: bool, seed: int) -> dict:
    route = osrm_route(a, b)
    coords = np.array(route["geometry"]["coordinates"])  # lon, lat
    lon, lat = coords[:, 0], coords[:, 1]
    ann = route["legs"][0]["annotation"]
    dist, dur = np.array(ann["distance"]), np.array(ann["duration"])
    cum_d = np.concatenate([[0.0], np.cumsum(dist)])
    cum_t = np.concatenate([[0.0], np.cumsum(dur)])

    # 250 m pieces
    plat, plon, grid, _ = resample(lat, lon, PIECE_M)
    n_pieces = len(grid) - 1
    piece_len = np.diff(grid)
    t_at = np.interp(grid, cum_d, cum_t)
    v_osrm = piece_len / np.maximum(np.diff(t_at), 1e-3)
    z = elevations(plat, plon)
    z_smooth = np.convolve(np.pad(z, 2, mode="edge"), np.ones(5) / 5, mode="valid")  # ~1 km smoothing

    # 50 m resample -> small-scale curvature per piece
    flat, flon, fgrid, _ = resample(lat, lon, HEADING_STEP_M)
    curv = heading_change_deg_per_km(flat, flon)
    curv_piece = np.array([curv[int(grid[i] / HEADING_STEP_M): max(int(grid[i + 1] / HEADING_STEP_M), int(grid[i] / HEADING_STEP_M) + 1)].mean() for i in range(n_pieces)])

    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    return {
        "name": name, "anchor": anchor, "osrm_distance_m": float(route["distance"]), "osrm_duration_s": float(route["duration"]),
        "lat": plat, "lon": plon, "piece_len_m": piece_len, "z_m": z_smooth, "curv_deg_km": curv_piece,
        "v_osrm_ms": np.clip(v_osrm, 1.0, 35.0), "rain": rain_samples(mid[0], mid[1], seed),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    pairs = [(p, True) for p in ANCHOR_PAIRS] + [(p, False) for p in OTHER_PAIRS]
    if args.limit:
        pairs = pairs[: args.limit]
    corridors = []
    for i, ((a, b), anchor) in enumerate(pairs):
        name = f"{a}-{b}"
        t0 = time.time()
        try:
            c = build_corridor(name, PLACES[a], PLACES[b], anchor, seed=i)
        except Exception as exc:  # noqa: BLE001
            print(f"[{i + 1}/{len(pairs)}] {name}: SKIPPED ({exc})", flush=True)
            continue
        corridors.append(c)
        print(f"[{i + 1}/{len(pairs)}] {name}: {c['piece_len_m'].sum() / 1000:.0f} km, gain {np.clip(np.diff(c['z_m']), 0, None).sum():.0f} m, "
              f"curv {c['curv_deg_km'].mean():.0f} deg/km, rain samples {len(c['rain'])}, OSRM {c['osrm_duration_s'] / 3600:.2f} h ({time.time() - t0:.0f}s)", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "routes.pkl", "wb") as f:
        pickle.dump(corridors, f)
    print(f"saved {len(corridors)} corridors, total {sum(c['piece_len_m'].sum() for c in corridors) / 1000:.0f} km")


if __name__ == "__main__":
    main()
