export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  /** Symbol family: vehicle, incident, facility, report, self. Drives shape as well as color. */
  kind: "vehicle" | "incident" | "facility" | "report" | "self" | "stop";
  label: string;
  tone?: "danger" | "warn" | "ok" | "neutral" | "info";
  /** True for a last-known position that is not a recent observed fix. Rendered hollow with a dashed border. */
  stale?: boolean;
  glyph?: string;
}

export interface Cluster {
  id: string;
  lon: number;
  lat: number;
  members: MapPoint[];
}

/** Web-mercator world size in pixels at a given zoom (512px tiles, MapLibre convention). */
function worldSize(zoom: number): number {
  return 512 * 2 ** zoom;
}

function project(lon: number, lat: number, zoom: number): [number, number] {
  const size = worldSize(zoom);
  const x = ((lon + 180) / 360) * size;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
  return [x, y];
}

/**
 * Grid-based clustering in screen space. Deterministic and cheap; adequate for the
 * tens-to-hundreds of vehicle/incident markers a viewport holds. Points never
 * cluster at or beyond `maxClusterZoom` so individual items stay selectable.
 */
export function clusterPoints(points: readonly MapPoint[], zoom: number, cellPx = 56, maxClusterZoom = 13): Array<MapPoint | Cluster> {
  if (zoom >= maxClusterZoom) return [...points];
  const cells = new Map<string, MapPoint[]>();
  for (const p of points) {
    const [x, y] = project(p.lon, p.lat, zoom);
    const key = `${Math.floor(x / cellPx)}:${Math.floor(y / cellPx)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(p);
    else cells.set(key, [p]);
  }
  const out: Array<MapPoint | Cluster> = [];
  for (const [key, members] of cells) {
    if (members.length === 1 && members[0]) {
      out.push(members[0]);
      continue;
    }
    const lon = members.reduce((s, m) => s + m.lon, 0) / members.length;
    const lat = members.reduce((s, m) => s + m.lat, 0) / members.length;
    out.push({ id: `cluster:${key}`, lon, lat, members });
  }
  return out;
}

export function isCluster(item: MapPoint | Cluster): item is Cluster {
  return "members" in item;
}
