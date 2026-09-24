import type { RoutePlan } from "@/shared/api";
import { bearing, haversineMeters } from "@/shared/lib/geo";
import { lineStrings } from "./geometry";

export type TurnKind =
  | "start"
  | "straight"
  | "slight_left"
  | "slight_right"
  | "left"
  | "right"
  | "sharp_left"
  | "sharp_right"
  | "uturn"
  | "arrive";

export interface DirectionStep {
  roadName: string;
  turn: TurnKind;
  distanceMeters: number;
  durationSeconds: number;
  /** Where this step begins, for centering the map when the step is focused. */
  at: [number, number];
}

function classifyTurn(deltaDeg: number): TurnKind {
  const d = ((deltaDeg + 180) % 360 + 360) % 360 - 180; // normalize to (-180, 180]
  const abs = Math.abs(d);
  if (abs < 12) return "straight";
  if (abs < 45) return d > 0 ? "slight_right" : "slight_left";
  if (abs < 120) return d > 0 ? "right" : "left";
  if (abs < 160) return d > 0 ? "sharp_right" : "sharp_left";
  return "uturn";
}

/**
 * Google-Maps-style turn-by-turn steps, built entirely client-side. The route's merged
 * geometry (primary_geometry, or an alternative's geometry) is already correctly oriented
 * in the direction of travel — this walks it using each edge's cumulative distance to find
 * where one road ends and the next begins, and the bearing change there to classify the
 * turn. Consecutive edges that share a road name are merged into one step, since a driver
 * experiences "NH-6 for 12 km" as one instruction, not one per underlying database edge.
 */
export function buildDirections(plan: RoutePlan, rank: number | null = null): DirectionStep[] {
  const alt = rank === null ? null : plan.alternatives.find((a) => a.rank === rank);
  const edges = alt ? alt.edges : plan.edges;
  const geometry = alt ? alt.geometry : plan.primary_geometry;
  const coords = lineStrings(geometry).flat();
  if (coords.length < 2 || edges.length === 0) return [];

  const vertexDist: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1] as [number, number];
    const b = coords[i] as [number, number];
    vertexDist.push((vertexDist[i - 1] as number) + haversineMeters(a[1], a[0], b[1], b[0]));
  }
  const lastVertex = coords.length - 1;
  const vertexNear = (distanceMeters: number): number => {
    let lo = 0;
    let hi = lastVertex;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((vertexDist[mid] as number) < distanceMeters) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  interface Group { roadName: string; distanceMeters: number; durationSeconds: number; endVertex: number }
  const groups: Group[] = [];
  let prevCumDist = 0;
  let prevCumDur = 0;
  for (const e of [...edges].sort((a, b) => a.sequence_order - b.sequence_order)) {
    const roadName = e.road_name ?? "Unnamed road";
    const segDist = e.cumulative_distance_meters - prevCumDist;
    const segDur = e.cumulative_duration_seconds - prevCumDur;
    prevCumDist = e.cumulative_distance_meters;
    prevCumDur = e.cumulative_duration_seconds;
    const endVertex = vertexNear(e.cumulative_distance_meters);
    const last = groups[groups.length - 1];
    if (last && last.roadName === roadName) {
      last.distanceMeters += segDist;
      last.durationSeconds += segDur;
      last.endVertex = endVertex;
    } else {
      groups.push({ roadName, distanceMeters: segDist, durationSeconds: segDur, endVertex });
    }
  }

  const steps: DirectionStep[] = [];
  let startVertex = 0;
  groups.forEach((g, i) => {
    const from = coords[Math.min(startVertex, lastVertex)] as [number, number];
    let turn: TurnKind = "start";
    if (i > 0) {
      const prev = groups[i - 1] as Group;
      const beforeIdx = Math.max(prev.endVertex - 1, 0);
      const beforeEnd = coords[Math.min(prev.endVertex, lastVertex)] as [number, number];
      const beforeStart = coords[beforeIdx] as [number, number];
      const afterIdx = Math.min(startVertex + 1, lastVertex);
      const afterEnd = coords[afterIdx] as [number, number];
      const beforeBearing = bearing(beforeStart[0], beforeStart[1], beforeEnd[0], beforeEnd[1]);
      const afterBearing = bearing(from[0], from[1], afterEnd[0], afterEnd[1]);
      turn = classifyTurn(afterBearing - beforeBearing);
    }
    steps.push({ roadName: g.roadName, turn, distanceMeters: g.distanceMeters, durationSeconds: g.durationSeconds, at: from });
    startVertex = g.endVertex;
  });
  steps.push({ roadName: "Destination", turn: "arrive", distanceMeters: 0, durationSeconds: 0, at: coords[lastVertex] as [number, number] });
  return steps;
}
