"""
ml-training/scripts/eta_physics.py — physics-informed travel-time model used to LABEL synthetic NE ETA data.

Every number here is an ASSUMPTION unless noted; the two calibrated parameters (`q`, `c_ref`) are fitted to
four published typical car travel times (data/eta_ne/anchors.json). The result is synthetic data with
realistic road geometry and terrain - it is NOT measured trip data, and the accuracy of a model trained on
it against reality is unknown until real GPS trips are available.

Per 250 m piece of road:
  free speed   v_flat = q * min(vehicle cap, OSRM road-class speed) / (1 + curvature / c_ref)
  uphill       v_up   = softmin(v_flat, drive_eff * P / (m g (Crr + grade)))       (power-limited climb)
  downhill     v_down = v_flat * (1 - down_pen * min(1, |grade| / 0.08))           (cautious descent)
  rain         v     *= 1 - rain_drop * (1 - exp(-rain_mm_hr / rain_scale))        (assumed; FHWA reports
                                                                                    ~3-17 % for rain on highways,
                                                                                    hill roads assumed worse)
  time         t = L / v
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

G = 9.81


@dataclass
class Params:
    q: float = 0.6  # NE road quality / typical traffic factor (CALIBRATED on anchors)
    c_ref: float = 250.0  # deg/km at which curvature halves the free speed (CALIBRATED on anchors)
    crr: float = 0.014  # rolling resistance on NE roads (assumed)
    drive_eff: float = 0.85  # drivetrain efficiency (assumed)
    down_pen: float = 0.15  # max fractional speed loss on steep descents (assumed)
    rain_drop: float = 0.30  # max fractional speed loss in very heavy rain (assumed)
    rain_scale: float = 12.0  # mm/h e-folding scale of the rain effect (assumed)
    softmin_p: float = 4.0

    def as_dict(self) -> dict[str, float]:
        return asdict(self)


# gvw: gross vehicle weight range (kg) - this is what the backend passes as `vehicle_weight_kg`;
# kw_per_t: engine power per tonne of GVW (assumed, typical Indian LCV/HCV); v_cap: open-road speed cap (m/s);
# load: fraction of GVW actually carried (unknown to the model, adds realistic noise).
VEHICLE_CLASSES: dict[str, dict] = {
    "car": {"gvw": (1500.0, 2100.0), "kw_per_t": 45.0, "v_cap": 22.0, "load": (0.6, 0.9), "weight": 0.10},
    "van": {"gvw": (2500.0, 4500.0), "kw_per_t": 22.0, "v_cap": 18.0, "load": (0.4, 1.0), "weight": 0.30},
    "medium": {"gvw": (7000.0, 12000.0), "kw_per_t": 11.0, "v_cap": 15.0, "load": (0.4, 1.0), "weight": 0.40},
    "heavy": {"gvw": (16000.0, 25000.0), "kw_per_t": 7.5, "v_cap": 13.0, "load": (0.4, 1.0), "weight": 0.20},
}


def softmin(a: np.ndarray, b: np.ndarray, p: float) -> np.ndarray:
    return (a ** (-p) + b ** (-p)) ** (-1.0 / p)


def sample_vehicle(rng: np.random.Generator, cls: str) -> dict[str, float]:
    v = VEHICLE_CLASSES[cls]
    gvw = float(rng.uniform(*v["gvw"]))
    return {
        "gvw": gvw,
        "mass": gvw * float(rng.uniform(*v["load"])),
        "power_w": v["kw_per_t"] * 1000.0 * gvw / 1000.0,
        "v_cap": v["v_cap"],
    }


def piece_times_s(
    length_m: np.ndarray,
    dz_m: np.ndarray,
    curv_deg_km: np.ndarray,
    v_osrm_ms: np.ndarray,
    veh: dict[str, float],
    rain_mm_hr: np.ndarray | float,
    p: Params,
) -> np.ndarray:
    grade = dz_m / length_m
    v_flat = p.q * np.minimum(veh["v_cap"], v_osrm_ms) / (1.0 + curv_deg_km / p.c_ref)
    up = np.clip(grade, 0.0, None)
    v_climb = p.drive_eff * veh["power_w"] / (veh["mass"] * G * (p.crr + up))
    v_up = softmin(v_flat, v_climb, p.softmin_p)
    down = np.clip(-grade, 0.0, None)
    v_down = v_flat * (1.0 - p.down_pen * np.minimum(1.0, down / 0.08))
    v = np.where(grade >= 0.0, v_up, v_down)
    rain_factor = 1.0 - p.rain_drop * (1.0 - np.exp(-np.asarray(rain_mm_hr) / p.rain_scale))
    return length_m / np.maximum(v * rain_factor, 0.8)


def route_time_s(corridor: dict, veh: dict[str, float], p: Params, rain_mm_hr: float = 0.0) -> float:
    dz = np.diff(corridor["z_m"])
    return float(piece_times_s(corridor["piece_len_m"], dz, corridor["curv_deg_km"], corridor["v_osrm_ms"], veh, rain_mm_hr, p).sum())


def _target_s(corridor: dict, anchor: dict) -> float:
    """Anchor time scaled by route length (OSRM may pick a slightly different road than the published figure)."""
    km = float(corridor["piece_len_m"].sum() / 1000.0)
    return anchor["typical_hours"] * 3600.0 * km / anchor["km"]


CAR_REFERENCE = {"gvw": 1800.0, "mass": 1350.0, "power_w": 45.0 * 1800.0, "v_cap": 22.0}


def calibrate(corridors: list[dict], anchors: dict[str, dict]) -> tuple[Params, list[dict]]:
    """Grid-fit (q, c_ref) so that a dry-weather reference CAR reproduces the anchor typical times (log error)."""
    used = [(c, anchors[c["name"]]) for c in corridors if c["name"] in anchors]
    if not used:
        raise ValueError("no anchor corridors present")
    best: tuple[float, Params] | None = None
    for q in np.arange(0.25, 1.001, 0.01):
        for c_ref in np.concatenate([np.arange(40.0, 400.0, 10.0), np.arange(400.0, 2001.0, 50.0)]):
            p = Params(q=float(q), c_ref=float(c_ref))
            err = sum((np.log(route_time_s(c, CAR_REFERENCE, p) / _target_s(c, a))) ** 2 for c, a in used)
            if best is None or err < best[0]:
                best = (err, p)
    assert best is not None
    p = best[1]
    report = []
    for c, a in used:
        pred_h = route_time_s(c, CAR_REFERENCE, p) / 3600.0
        report.append({
            "corridor": c["name"], "km": round(float(c["piece_len_m"].sum() / 1000.0), 1), "anchor_km": a["km"],
            "target_hours": round(_target_s(c, a) / 3600.0, 2), "typical_hours": a["typical_hours"],
            "range_hours": [round(x * c["piece_len_m"].sum() / 1000.0 / a["km"], 2) for x in a["range_hours"]], "predicted_hours": round(pred_h, 2),
            "osrm_hours": round(c["osrm_duration_s"] / 3600.0, 2),
            "within_published_range": bool(a["range_hours"][0] * c["piece_len_m"].sum() / 1000.0 / a["km"] <= pred_h <= a["range_hours"][1] * c["piece_len_m"].sum() / 1000.0 / a["km"]),
        })
    return p, report
