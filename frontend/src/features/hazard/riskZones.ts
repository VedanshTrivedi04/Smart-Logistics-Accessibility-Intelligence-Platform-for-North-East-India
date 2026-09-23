import type { HazardZone, RiskLevel } from "@/shared/map";

const RISK_LEVELS: readonly string[] = ["LOW", "MODERATE", "HIGH", "SEVERE", "UNKNOWN"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * The risk-zones endpoint types its response as a free-form object (like /network/edges),
 * so the GeoJSON is validated at runtime instead of blindly cast. Malformed features are
 * skipped rather than rendered as a false "low risk" zone.
 */
export function parseRiskZoneCollection(raw: unknown): { zones: HazardZone[]; count: number } {
  const zones: HazardZone[] = [];
  if (!isRecord(raw) || !Array.isArray(raw["features"])) return { zones, count: 0 };
  for (const f of raw["features"] as unknown[]) {
    if (!isRecord(f) || typeof f["id"] !== "string") continue;
    const geometry = f["geometry"];
    const p = f["properties"];
    if (!isRecord(geometry) || !Array.isArray(geometry["coordinates"]) || !isRecord(p)) continue;
    const ring = (geometry["coordinates"] as unknown[])[0];
    if (!Array.isArray(ring)) continue;
    const polygon = ring.filter(
      (c): c is [number, number] => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number",
    ).map((c) => [c[0], c[1]] as [number, number]);
    if (polygon.length < 4) continue;
    const riskLevel = typeof p["risk_level"] === "string" && RISK_LEVELS.includes(p["risk_level"]) ? (p["risk_level"] as RiskLevel) : "UNKNOWN";
    zones.push({
      id: f["id"],
      name: typeof p["name"] === "string" ? p["name"] : undefined,
      riskLevel,
      riskScore: typeof p["risk_score"] === "number" ? p["risk_score"] : null,
      rainfallMm24h: typeof p["rainfall_mm_24h"] === "number" ? p["rainfall_mm_24h"] : null,
      polygon,
    });
  }
  return { zones, count: zones.length };
}

const SEVERITY_ORDER: Record<RiskLevel, number> = { SEVERE: 0, HIGH: 1, MODERATE: 2, UNKNOWN: 3, LOW: 4 };

/** Most dangerous first, so an at-a-glance list leads with what needs attention. */
export function sortByRisk(zones: readonly HazardZone[]): HazardZone[] {
  return [...zones].sort((a, b) => (SEVERITY_ORDER[a.riskLevel] ?? 5) - (SEVERITY_ORDER[b.riskLevel] ?? 5));
}

/** True if any leg of a route line passes through a HIGH/SEVERE risk zone (simple bbox containment check). */
export function routeCrossesHighRisk(routeCoordinates: readonly [number, number][], zones: readonly HazardZone[]): HazardZone[] {
  const dangerous = zones.filter((z) => z.riskLevel === "HIGH" || z.riskLevel === "SEVERE");
  if (dangerous.length === 0) return [];
  const hits: HazardZone[] = [];
  for (const zone of dangerous) {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lon, lat] of zone.polygon) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const crosses = routeCoordinates.some(([lon, lat]) => lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat);
    if (crosses) hits.push(zone);
  }
  return hits;
}
