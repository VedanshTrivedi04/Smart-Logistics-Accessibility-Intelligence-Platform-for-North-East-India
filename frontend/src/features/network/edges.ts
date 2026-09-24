import type { AccessibilityStatus } from "@/shared/api";
import type { LineClass, MapLine } from "@/shared/map";

export interface EdgeProps {
  edge_index: number;
  road_class: string;
  road_name: string | null;
  surface_type: string;
  speed_limit_kmh: number;
  length_meters: number;
  base_seconds: number;
  is_one_way: boolean;
  is_bridge: boolean;
  accessibility_status: AccessibilityStatus;
  freshness: string;
  status_version: number;
  /** Jurisdiction (state or district) the segment belongs to; null when the import did not assign one. */
  jurisdiction_id: string | null;
}

export interface EdgeFeature {
  id: string;
  props: EdgeProps;
  coordinates: Array<[number, number]>;
}

export interface EdgeCollection {
  features: EdgeFeature[];
  count: number;
  simplified: boolean;
}

const STATUSES: readonly string[] = ["OPEN", "RESTRICTED", "BLOCKED", "PROVISIONAL_CAUTION", "UNKNOWN"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * The OpenAPI schema types this endpoint as a free-form object, so the GeoJSON
 * is validated at runtime instead of blindly cast. Malformed features are skipped
 * (and counted by the caller through `count`), never rendered as "open".
 */
export function parseEdgeCollection(raw: unknown): EdgeCollection {
  const out: EdgeFeature[] = [];
  if (!isRecord(raw) || !Array.isArray(raw["features"])) return { features: out, count: 0, simplified: false };
  for (const f of raw["features"] as unknown[]) {
    if (!isRecord(f) || typeof f["id"] !== "string") continue;
    const geometry = f["geometry"];
    const p = f["properties"];
    if (!isRecord(geometry) || !Array.isArray(geometry["coordinates"]) || !isRecord(p)) continue;
    const coords = (geometry["coordinates"] as unknown[]).filter(
      (c): c is [number, number] => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number",
    ).map((c) => [c[0], c[1]] as [number, number]);
    if (coords.length < 2) continue;
    const status = typeof p["accessibility_status"] === "string" && STATUSES.includes(p["accessibility_status"]) ? (p["accessibility_status"] as AccessibilityStatus) : "UNKNOWN";
    out.push({
      id: f["id"],
      coordinates: coords,
      props: {
        edge_index: Number(p["edge_index"] ?? 0),
        road_class: String(p["road_class"] ?? ""),
        road_name: typeof p["road_name"] === "string" ? p["road_name"] : null,
        surface_type: String(p["surface_type"] ?? ""),
        speed_limit_kmh: Number(p["speed_limit_kmh"] ?? 0),
        length_meters: Number(p["length_meters"] ?? 0),
        base_seconds: Number(p["base_seconds"] ?? 0),
        is_one_way: Boolean(p["is_one_way"]),
        is_bridge: Boolean(p["is_bridge"]),
        accessibility_status: status,
        freshness: String(p["freshness"] ?? "UNKNOWN"),
        status_version: Number(p["status_version"] ?? 0),
        jurisdiction_id: typeof p["jurisdiction_id"] === "string" ? p["jurisdiction_id"] : null,
      },
    });
  }
  const meta = isRecord(raw["meta"]) ? raw["meta"] : {};
  return { features: out, count: out.length, simplified: Boolean(meta["simplified"]) };
}

export function lineClassFor(status: AccessibilityStatus): LineClass {
  switch (status) {
    case "OPEN":
      return "open";
    case "RESTRICTED":
      return "restricted";
    case "BLOCKED":
      return "blocked";
    case "PROVISIONAL_CAUTION":
      return "caution";
    default:
      return "unknown";
  }
}

export function edgeLines(features: readonly EdgeFeature[]): MapLine[] {
  return features.map((f) => ({ id: f.id, cls: lineClassFor(f.props.accessibility_status), coordinates: f.coordinates }));
}

const SEVERITY_ORDER: Record<AccessibilityStatus, number> = { BLOCKED: 0, RESTRICTED: 1, PROVISIONAL_CAUTION: 2, UNKNOWN: 3, OPEN: 4 };

/** Most disruptive first, so the list leads with what needs attention. */
export function sortBySeverity(features: readonly EdgeFeature[]): EdgeFeature[] {
  return [...features].sort(
    (a, b) => SEVERITY_ORDER[a.props.accessibility_status] - SEVERITY_ORDER[b.props.accessibility_status] || (a.props.road_name ?? "").localeCompare(b.props.road_name ?? ""),
  );
}

export interface EdgeSummary {
  total: number;
  byStatus: Record<AccessibilityStatus, number>;
  totalLengthM: number;
  openLengthM: number;
  /** Share of loaded network length that is verified open. Excludes anything not in the imported network. */
  openLengthShare: number | null;
}

export function summarizeEdges(features: readonly EdgeFeature[]): EdgeSummary {
  const byStatus: Record<AccessibilityStatus, number> = { OPEN: 0, RESTRICTED: 0, BLOCKED: 0, PROVISIONAL_CAUTION: 0, UNKNOWN: 0 };
  let total = 0;
  let open = 0;
  for (const f of features) {
    byStatus[f.props.accessibility_status]++;
    total += f.props.length_meters;
    if (f.props.accessibility_status === "OPEN") open += f.props.length_meters;
  }
  return { total: features.length, byStatus, totalLengthM: total, openLengthM: open, openLengthShare: total > 0 ? open / total : null };
}

export function edgeLabel(f: EdgeFeature | { road_name: string | null; edge_index: number }): string {
  const p = "props" in f ? f.props : f;
  return p.road_name || `Unnamed segment #${p.edge_index}`;
}
