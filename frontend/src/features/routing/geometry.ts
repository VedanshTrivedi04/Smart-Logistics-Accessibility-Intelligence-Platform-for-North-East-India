import type { MapLine } from "@/shared/map";
import type { RoutePlan } from "@/shared/api";

type Coord = [number, number];

/** Route geometry arrives as free-form GeoJSON; accept LineString / MultiLineString and ignore anything else. */
export function lineStrings(geometry: unknown): Coord[][] {
  if (typeof geometry !== "object" || geometry === null) return [];
  const g = geometry as { type?: unknown; coordinates?: unknown };
  const toLine = (v: unknown): Coord[] =>
    Array.isArray(v) ? v.filter((c): c is number[] => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number").map((c) => [c[0] as number, c[1] as number]) : [];
  if (g.type === "LineString") {
    const l = toLine(g.coordinates);
    return l.length > 1 ? [l] : [];
  }
  if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
    return (g.coordinates as unknown[]).map(toLine).filter((l) => l.length > 1);
  }
  return [];
}

export function planLines(plan: RoutePlan, highlightRank: number | null = null): MapLine[] {
  const lines: MapLine[] = [];
  lineStrings(plan.primary_geometry).forEach((coordinates, i) => lines.push({ id: `primary:${i}`, cls: "route_primary", coordinates }));
  plan.alternatives.forEach((alt) => {
    lineStrings(alt.geometry).forEach((coordinates, i) => lines.push({ id: `alt:${alt.rank}:${i}`, cls: highlightRank === alt.rank || highlightRank === null ? "route_alt" : "trail", coordinates }));
  });
  return lines;
}

/** Group excluded segments by the rule that excluded them. */
export function exclusionSummary(reasons: Record<string, string[]>): Array<{ reason: string; segments: number }> {
  const counts = new Map<string, number>();
  for (const list of Object.values(reasons)) {
    for (const r of list) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return [...counts.entries()].map(([reason, segments]) => ({ reason, segments })).sort((a, b) => b.segments - a.segments);
}
