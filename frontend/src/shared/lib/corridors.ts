import { haversineMeters, type BBox } from "./geo";

export interface CorridorMilestone {
  id: string;
  name: string;
  corridor: "NH-6" | "NH-27" | "NH-6 / NH-27";
  chainageKm: number;
  lat: number;
  lon: number;
}

export interface CorridorSegment {
  corridor: "NH-6" | "NH-27";
  name: string;
  startKm: number;
  endKm: number;
  coords: ReadonlyArray<[number, number]>; // [lon, lat] pairs matching GeoJSON / PostGIS
}

export interface CorridorSnapResult {
  corridorName: "NH-6" | "NH-27" | "Lifeline Corridor";
  chainageKm: number;
  nearestMilestone: string;
  offCorridorM: number;
  isWithinCorridor: boolean;
  formattedChainage: string;
}

/** Bounding box strictly encompassing the NH-27 / NH-6 Lifeline Patrol Corridor */
export const LIFELINE_CORRIDOR_BBOX: BBox = [91.50, 24.70, 92.95, 26.40];

/** Authentic milestones for ground officers to report or fallback to when GPS is unavailable */
export const CORRIDOR_MILESTONES: readonly CorridorMilestone[] = [
  { id: "ghy_jalukbari", name: "Jalukbari Rotary (Saraighat Approach)", corridor: "NH-6 / NH-27", chainageKm: 0.0, lat: 26.155, lon: 91.6815 },
  { id: "ghy_dispur", name: "Guwahati City Center / Dispur", corridor: "NH-6", chainageKm: 8.5, lat: 26.145, lon: 91.735 },
  { id: "ghy_khanapara", name: "Khanapara Inter-State Gate", corridor: "NH-6", chainageKm: 14.2, lat: 26.115, lon: 91.785 },
  { id: "jorabat_junction", name: "Jorabat Strategic Fork (Assam-Meghalaya)", corridor: "NH-6 / NH-27", chainageKm: 21.5, lat: 26.085, lon: 91.865 },
  { id: "byrnihat_checkpoint", name: "Byrnihat Industrial Checkpoint", corridor: "NH-6", chainageKm: 29.8, lat: 26.045, lon: 91.875 },
  { id: "umtrew_bridge", name: "Umtrew River Heavy Bridge", corridor: "NH-6", chainageKm: 38.5, lat: 25.965, lon: 91.882 },
  { id: "nongpoh_valley", name: "Nongpoh Valley Command Post", corridor: "NH-6", chainageKm: 52.4, lat: 25.905, lon: 91.881 },
  { id: "umsning_bypass", name: "Umsning Mountain Expressway Gate", corridor: "NH-6", chainageKm: 74.0, lat: 25.755, lon: 91.912 },
  { id: "umiam_barapani", name: "Umiam Lake (Barapani Bridge)", corridor: "NH-6", chainageKm: 88.0, lat: 25.665, lon: 91.908 },
  { id: "shillong_civil", name: "Shillong Civil Hospital Lifeline Hub", corridor: "NH-6", chainageKm: 102.5, lat: 25.575, lon: 91.885 },
  { id: "jowai_crossroads", name: "Jowai Commercial Crossroads", corridor: "NH-6", chainageKm: 166.5, lat: 25.450, lon: 92.200 },
  { id: "khliehriat_plateau", name: "Khliehriat High Plateau Fork", corridor: "NH-6", chainageKm: 204.5, lat: 25.350, lon: 92.360 },
  { id: "sonapur_pass", name: "Sonapur Mountain Pass / Tunnel", corridor: "NH-6", chainageKm: 222.0, lat: 25.120, lon: 92.510 },
  { id: "silchar_depot", name: "Silchar Barak Multimodal Center", corridor: "NH-6", chainageKm: 322.5, lat: 24.817, lon: 92.799 },
  // NH-27 Guwahati - Nagaon Expressway
  { id: "khetri_toll", name: "Khetri Toll Plaza (NH-27)", corridor: "NH-27", chainageKm: 42.0, lat: 26.115, lon: 91.970 },
  { id: "jagiroad_paper", name: "Jagiroad Transport Gate", corridor: "NH-27", chainageKm: 58.0, lat: 26.170, lon: 92.160 },
  { id: "nagaon_junction", name: "Nagaon Central Transport Junction", corridor: "NH-27", chainageKm: 119.5, lat: 26.345, lon: 92.684 },
];

/** Authentic road curvature geometries derived from PostGIS network edges */
export const CORRIDOR_SEGMENTS: readonly CorridorSegment[] = [
  {
    corridor: "NH-6",
    name: "Amingaon to Guwahati City Center",
    startKm: 0.0,
    endKm: 8.5,
    coords: [
      [91.6850, 26.1850], [91.6840, 26.1780], [91.6830, 26.1710], [91.6825, 26.1660],
      [91.6835, 26.1590], [91.6815, 26.1550], [91.6760, 26.1520], [91.6660, 26.1475],
      [91.6750, 26.1500], [91.6880, 26.1535], [91.7000, 26.1560], [91.7085, 26.1578],
      [91.7180, 26.1580], [91.7260, 26.1530], [91.7350, 26.1450]
    ],
  },
  {
    corridor: "NH-6",
    name: "Guwahati City Center to Khanapara",
    startKm: 8.5,
    endKm: 14.2,
    coords: [
      [91.7350, 26.1450], [91.7480, 26.1470], [91.7600, 26.1495], [91.7730, 26.1460],
      [91.7820, 26.1320], [91.7850, 26.1150]
    ],
  },
  {
    corridor: "NH-6",
    name: "Khanapara to Jorabat Bypass",
    startKm: 14.2,
    endKm: 21.5,
    coords: [
      [91.7850, 26.1150], [91.7980, 26.1140], [91.8120, 26.1120], [91.8210, 26.1090],
      [91.8340, 26.1010], [91.8470, 26.0950], [91.8580, 26.0895], [91.8650, 26.0850]
    ],
  },
  {
    corridor: "NH-6",
    name: "Jorabat to Byrnihat Checkpoint",
    startKm: 21.5,
    endKm: 29.8,
    coords: [
      [91.8650, 26.0850], [91.8660, 26.0820], [91.8675, 26.0760], [91.8690, 26.0710],
      [91.8710, 26.0640], [91.8725, 26.0570], [91.8735, 26.0510], [91.8745, 26.0470],
      [91.8750, 26.0450]
    ],
  },
  {
    corridor: "NH-6",
    name: "Byrnihat to Umtrew River Valley",
    startKm: 29.8,
    endKm: 38.5,
    coords: [
      [91.8750, 26.0450], [91.8760, 26.0400], [91.8770, 26.0345], [91.8780, 26.0280],
      [91.8790, 26.0210], [91.8798, 26.0145], [91.8805, 26.0080], [91.8810, 26.0000],
      [91.8815, 25.9920], [91.8818, 25.9850], [91.8820, 25.9780], [91.8820, 25.9650]
    ],
  },
  {
    corridor: "NH-6",
    name: "Umtrew Bridge South to Nongpoh Valley",
    startKm: 38.5,
    endKm: 52.4,
    coords: [
      [91.8820, 25.9650], [91.8828, 25.9610], [91.8835, 25.9570], [91.8840, 25.9550],
      [91.8835, 25.9460], [91.8825, 25.9390], [91.8820, 25.9320], [91.8810, 25.9250],
      [91.8800, 25.9180], [91.8805, 25.9120], [91.8810, 25.9050]
    ],
  },
  {
    corridor: "NH-6",
    name: "Nongpoh to Umsning Expressway",
    startKm: 52.4,
    endKm: 74.0,
    coords: [
      [91.8810, 25.9050], [91.8818, 25.8950], [91.8825, 25.8850], [91.8832, 25.8750],
      [91.8840, 25.8650], [91.8845, 25.8525], [91.8850, 25.8400], [91.8848, 25.8300],
      [91.8845, 25.8200], [91.8855, 25.8100], [91.8875, 25.8000], [91.8905, 25.7900],
      [91.8940, 25.7800], [91.8985, 25.7725], [91.9030, 25.7650], [91.9075, 25.7600],
      [91.9120, 25.7550]
    ],
  },
  {
    corridor: "NH-6",
    name: "Umsning to Umiam Barapani Lake",
    startKm: 74.0,
    endKm: 88.0,
    coords: [
      [91.9120, 25.7550], [91.9115, 25.7465], [91.9110, 25.7380], [91.9102, 25.7290],
      [91.9095, 25.7200], [91.9080, 25.7110], [91.9065, 25.7020], [91.9050, 25.6935],
      [91.9035, 25.6850], [91.9055, 25.6750], [91.9080, 25.6650]
    ],
  },
  {
    corridor: "NH-6",
    name: "Umiam Dam to Shillong Civil Hospital",
    startKm: 88.0,
    endKm: 102.5,
    coords: [
      [91.9080, 25.6650], [91.9072, 25.6625], [91.9065, 25.6600], [91.9058, 25.6575],
      [91.9050, 25.6550], [91.9030, 25.6475], [91.9010, 25.6400], [91.8992, 25.6325],
      [91.8975, 25.6250], [91.8962, 25.6175], [91.8950, 25.6100], [91.8942, 25.6040],
      [91.8935, 25.5980], [91.8950, 25.5950], [91.8850, 25.5750]
    ],
  },
  {
    corridor: "NH-6",
    name: "Shillong to Jowai High Plateau Road",
    startKm: 102.5,
    endKm: 166.5,
    coords: [
      [91.8850, 25.5750], [91.9700, 25.5500], [92.0600, 25.5100], [92.1400, 25.4800],
      [92.2000, 25.4500]
    ],
  },
  {
    corridor: "NH-6",
    name: "Jowai to Khliehriat & Sonapur Pass",
    startKm: 166.5,
    endKm: 222.0,
    coords: [
      [92.2000, 25.4500], [92.2600, 25.4100], [92.3100, 25.3800], [92.3600, 25.3500],
      [92.4500, 25.2200], [92.5100, 25.1200]
    ],
  },
  {
    corridor: "NH-6",
    name: "Sonapur Pass to Silchar Multimodal Hub",
    startKm: 222.0,
    endKm: 322.5,
    coords: [
      [92.5100, 25.1200], [92.5500, 25.0800], [92.6800, 24.9500], [92.7500, 24.8800],
      [92.7990, 24.8170]
    ],
  },
  // ── NH-27 Guwahati to Nagaon Expressway ──
  {
    corridor: "NH-27",
    name: "Jorabat to Nagaon Central Expressway",
    startKm: 21.5,
    endKm: 119.5,
    coords: [
      [91.8650, 26.0850], [91.9700, 26.1150], [92.0700, 26.1350], [92.1600, 26.1700],
      [92.2900, 26.1950], [92.3900, 26.2250], [92.5200, 26.2600], [92.6840, 26.3450]
    ],
  },
];

/**
 * Projects point (pLat, pLon) onto line segment from (aLat, aLon) to (bLat, bLon).
 * Returns projected fraction t [0..1] and perpendicular distance in meters.
 */
function projectPointOnSegment(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): { t: number; distM: number; projLat: number; projLon: number } {
  const dx = bLon - aLon;
  const dy = bLat - aLat;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return {
      t: 0,
      distM: haversineMeters(pLat, pLon, aLat, aLon),
      projLat: aLat,
      projLon: aLon,
    };
  }

  // Linear projection scalar
  let t = ((pLon - aLon) * dx + (pLat - aLat) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projLat = aLat + t * dy;
  const projLon = aLon + t * dx;
  const distM = haversineMeters(pLat, pLon, projLat, projLon);

  return { t, distM, projLat, projLon };
}

/**
 * Snaps any GPS fix to the closest NH-6 or NH-27 corridor polyline segment.
 * Computes exact highway chainage (kilometre marker) and detects if officer is off-corridor.
 */
export function snapToCorridor(lat: number, lon: number): CorridorSnapResult {
  let minDistanceM = Infinity;
  let bestCorridor: "NH-6" | "NH-27" = "NH-6";
  let bestChainageKm = 0;

  for (const seg of CORRIDOR_SEGMENTS) {
    const coords = seg.coords;
    if (coords.length < 2) continue;

    // Calculate total geometric length of segment for fraction scaling
    let segGeoLenM = 0;
    const subLens: number[] = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const len = haversineMeters(coords[i]![1], coords[i]![0], coords[i + 1]![1], coords[i + 1]![0]);
      subLens.push(len);
      segGeoLenM += len;
    }

    let cumM = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const aLon = coords[i]![0];
      const aLat = coords[i]![1];
      const bLon = coords[i + 1]![0];
      const bLat = coords[i + 1]![1];
      const subLen = subLens[i] ?? 0;

      const proj = projectPointOnSegment(lat, lon, aLat, aLon, bLat, bLon);
      if (proj.distM < minDistanceM) {
        minDistanceM = proj.distM;
        bestCorridor = seg.corridor;

        // Cumulative segment distance in km
        const fractionAlongSeg = segGeoLenM > 0 ? (cumM + proj.t * subLen) / segGeoLenM : 0;
        const totalSpanKm = seg.endKm - seg.startKm;
        bestChainageKm = Math.round((seg.startKm + fractionAlongSeg * totalSpanKm) * 10) / 10;
      }
      cumM += subLen;
    }
  }

  // Find nearest authentic named landmark/milestone
  let nearestMilestone = "Lifeline Artery";
  let minMilestoneDist = Infinity;
  for (const m of CORRIDOR_MILESTONES) {
    const d = haversineMeters(lat, lon, m.lat, m.lon);
    if (d < minMilestoneDist) {
      minMilestoneDist = d;
      nearestMilestone = m.name;
    }
  }

  // Off corridor threshold: 1,500 meters (1.5 km)
  const isWithinCorridor = minDistanceM <= 1500;

  return {
    corridorName: bestCorridor,
    chainageKm: bestChainageKm,
    nearestMilestone,
    offCorridorM: Math.round(minDistanceM),
    isWithinCorridor,
    formattedChainage: `${bestCorridor} · KM ${bestChainageKm.toFixed(1)}`,
  };
}
