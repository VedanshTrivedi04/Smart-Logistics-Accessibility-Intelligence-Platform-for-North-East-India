import { describe, expect, it } from "vitest";
import { ApiError, fromResponse, kindFromStatus, networkError } from "@/shared/api/errors";
import { clearReviewedCatalogs, registerReviewedCatalog, renderNotice } from "@/shared/i18n";
import { bboxAround, haversineMeters, isValidLatLon } from "@/shared/lib/geo";
import { csvCell, toCsv } from "@/shared/lib/format";
import { ageSeconds, formatAge, formatDuration, secondsUntil } from "@/shared/lib/time";
import { clusterPoints, isCluster, type MapPoint } from "@/shared/map/cluster";
import { buildNotices } from "@/features/alerts/build";
import { describeGps } from "@/features/fleet/gps";
import { exclusionSummary, lineStrings } from "@/features/routing/geometry";
import { edgeLabel, parseEdgeCollection, sortBySeverity, summarizeEdges } from "@/features/network/edges";
import { countBy, dailyCounts, delta, inPeriod, resolvePeriod } from "@/features/analytics/periods";
import { validatePayload, isReportPayload } from "@/features/field/model";
import { syntheticPayload } from "../helpers";
import type { VehiclePosition } from "@/shared/api";

/** Deterministic clock for every freshness/expiry statement. */
const NOW = new Date("2026-03-10T12:00:00Z");

describe("freshness statements (fake clock)", () => {
  it("says how old something is in plain words", () => {
    expect(formatAge("2026-03-10T11:48:00Z", NOW)).toBe("12 minutes ago");
    expect(formatAge("2026-03-10T11:59:58Z", NOW)).toBe("just now");
    expect(formatAge(null, NOW)).toBe("unknown time");
    expect(ageSeconds("2026-03-10T11:00:00Z", NOW)).toBe(3600);
    expect(formatDuration(90 * 60)).toBe("1 h 30 min");
  });

  it("reports expiry as negative time once passed", () => {
    expect(secondsUntil("2026-03-10T12:05:00Z", NOW)).toBe(300);
    expect(secondsUntil("2026-03-10T11:59:00Z", NOW)).toBe(-60);
  });
});

describe("GPS description never calls stale data live", () => {
  const base: VehiclePosition = {
    vehicle_id: "v", device_id: null, active_trip_id: null, lat: 26, lon: 91, event_at: "2026-03-10T11:48:00Z", received_at: "2026-03-10T11:48:05Z",
    speed_kph: 40, heading_deg: 90, altitude_m: null, battery_pct: null, fix_quality: "GPS_FIX_3D", source_type: "HARDWARE_OBD_CELLULAR", stale_status: "FRESH", is_simulated: false, updated_at: "2026-03-10T11:48:05Z",
  };
  it("labels a current fix with its age", () => {
    const d = describeGps(base, NOW);
    expect(d.live).toBe(true);
    expect(d.statement).toBe("Last GPS update 12 minutes ago");
  });
  it("marks stale fixes as last known, not live, with no extrapolation", () => {
    const d = describeGps({ ...base, stale_status: "STALE_WARNING" }, NOW);
    expect(d.live).toBe(false);
    expect(d.stale).toBe(true);
    expect(d.statement).toContain("not live");
  });
  it("distinguishes never reported from stale and loading", () => {
    expect(describeGps(null, NOW).neverReported).toBe(true);
    expect(describeGps(undefined, NOW).neverReported).toBe(false);
  });
  it("calls out simulated replay", () => {
    expect(describeGps({ ...base, is_simulated: true }, NOW).statement).toContain("simulated");
  });
});

describe("API error normalisation", () => {
  const res = (status: number) => new Response(null, { status });
  it("maps statuses and codes to distinct kinds", () => {
    expect(kindFromStatus(412, undefined)).toBe("stale_version");
    expect(kindFromStatus(409, "STALE_ROUTE_PLAN")).toBe("stale_route");
    expect(kindFromStatus(403, undefined)).toBe("forbidden");
    expect(kindFromStatus(404, undefined)).toBe("not_found");
    expect(kindFromStatus(503, undefined)).toBe("server");
    expect(kindFromStatus(401, undefined)).toBe("unauthenticated");
  });
  it("reads the backend envelope", () => {
    const e = fromResponse(res(403), { code: "FORBIDDEN", message: "no scope", request_id: "abc", details: {} });
    expect(e).toBeInstanceOf(ApiError);
    expect([e.kind, e.code, e.message, e.requestId]).toEqual(["forbidden", "FORBIDDEN", "no scope", "abc"]);
  });
  it("reads FastAPI validation arrays", () => {
    const e = fromResponse(res(422), { detail: [{ loc: ["body", "reason"], msg: "too short" }] });
    expect(e.kind).toBe("validation");
    expect(e.message).toBe("reason: too short");
  });
  it("a network failure is retryable and is not an empty result", () => {
    const e = networkError(new TypeError("fetch failed"));
    expect(e.kind).toBe("network");
    expect(e.retryable).toBe(true);
    expect(fromResponse(res(403), {}).retryable).toBe(false);
  });
});

describe("notices: event codes are stable, wording is reviewed", () => {
  it("falls back to English and says so when no reviewed template exists", () => {
    clearReviewedCatalogs();
    const r = renderNotice("EDGE_BLOCKED", { road: "NH-6" }, "as");
    expect(r.text).toBe("Road segment NH-6 is blocked");
    expect(r.fellBack).toBe(true);
    expect(r.locale).toBe("en");
  });
  it("uses a reviewed template when one is registered", () => {
    registerReviewedCatalog("xx", { EDGE_BLOCKED: "[reviewed xx] {road}" });
    const r = renderNotice("EDGE_BLOCKED", { road: "NH-6" }, "xx");
    expect(r.fellBack).toBe(false);
    expect(r.text).toBe("[reviewed xx] NH-6");
    clearReviewedCatalogs();
  });
  it("builds notices ranked by severity with codes independent of text", () => {
    const notices = buildNotices({
      edges: [{ id: "e1", name: "NH-6", status: "RESTRICTED", at: "2026-03-10T10:00:00Z" }, { id: "e2", name: "Bypass", status: "BLOCKED", at: "2026-03-10T09:00:00Z" }, { id: "e3", name: "Lane", status: "OPEN", at: "2026-03-10T09:00:00Z" }],
    });
    expect(notices.map((n) => n.code)).toEqual(["EDGE_BLOCKED", "EDGE_RESTRICTED"]);
  });
});

describe("network parsing never turns unknown into open", () => {
  const feature = (status: unknown, id = "e1") => ({ type: "Feature", id, geometry: { type: "LineString", coordinates: [[91, 26], [91.1, 26.1]] }, properties: { edge_index: 7, road_class: "PRIMARY", road_name: null, surface_type: "PAVED", speed_limit_kmh: 40, length_meters: 500, base_seconds: 40, is_one_way: false, is_bridge: false, accessibility_status: status, freshness: "FRESH", status_version: 3 } });
  it("maps an unrecognised or missing status to UNKNOWN", () => {
    const parsed = parseEdgeCollection({ features: [feature("WEIRD"), feature(undefined, "e2")] });
    expect(parsed.features.map((f) => f.props.accessibility_status)).toEqual(["UNKNOWN", "UNKNOWN"]);
  });
  it("skips malformed features instead of drawing them", () => {
    const parsed = parseEdgeCollection({ features: [feature("OPEN"), { type: "Feature", id: "bad", geometry: { type: "LineString", coordinates: [[1, 1]] }, properties: {} }, null] });
    expect(parsed.features).toHaveLength(1);
  });
  it("orders blocked first and summarises by length", () => {
    const parsed = parseEdgeCollection({ features: [feature("OPEN", "a"), feature("BLOCKED", "b"), feature("RESTRICTED", "c")] });
    expect(sortBySeverity(parsed.features).map((f) => f.id)).toEqual(["b", "c", "a"]);
    const s = summarizeEdges(parsed.features);
    expect(s.openLengthShare).toBeCloseTo(1 / 3);
    expect(edgeLabel(parsed.features[0]!)).toBe("Unnamed segment #7");
  });
  it("returns nothing (not a fake road) for garbage input", () => {
    expect(parseEdgeCollection("nope").features).toEqual([]);
  });
});

describe("route geometry and exclusions", () => {
  it("summarises hard exclusions by rule", () => {
    expect(exclusionSummary({ a: ["BLOCKED"], b: ["BLOCKED", "BRIDGE_WEIGHT"], c: ["BLOCKED"] })).toEqual([{ reason: "BLOCKED", segments: 3 }, { reason: "BRIDGE_WEIGHT", segments: 1 }]);
  });
  it("accepts LineString and MultiLineString only", () => {
    expect(lineStrings({ type: "LineString", coordinates: [[1, 1], [2, 2]] })).toHaveLength(1);
    expect(lineStrings({ type: "MultiLineString", coordinates: [[[1, 1], [2, 2]], [[3, 3]]] })).toHaveLength(1);
    expect(lineStrings({ type: "Polygon", coordinates: [] })).toEqual([]);
    expect(lineStrings(null)).toEqual([]);
  });
});

describe("map clustering", () => {
  const pts = (n: number): MapPoint[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, kind: "vehicle", lon: 91 + i * 0.0001, lat: 26, label: `p${i}` }));
  it("groups nearby markers at low zoom and separates them when zoomed in", () => {
    const low = clusterPoints(pts(5), 6);
    expect(low).toHaveLength(1);
    expect(isCluster(low[0]!)).toBe(true);
    expect(clusterPoints(pts(5), 14)).toHaveLength(5);
  });
  it("never hides an isolated marker", () => {
    const far: MapPoint[] = [{ id: "a", kind: "incident", lon: 90, lat: 25, label: "a" }, { id: "b", kind: "incident", lon: 96, lat: 28, label: "b" }];
    expect(clusterPoints(far, 6)).toHaveLength(2);
  });
});

describe("geo and export helpers", () => {
  it("validates coordinates and computes distances", () => {
    expect(isValidLatLon(91, 0)).toBe(false);
    expect(isValidLatLon(26, 91)).toBe(true);
    expect(haversineMeters(26, 91, 26, 91)).toBe(0);
    expect(haversineMeters(26, 91, 27, 91)).toBeGreaterThan(110_000);
    const [minLon, minLat, maxLon, maxLat] = bboxAround(26, 91, 1000);
    expect(minLon).toBeLessThan(91);
    expect(maxLat).toBeGreaterThan(26);
    expect(minLat).toBeLessThan(26);
    expect(maxLon).toBeGreaterThan(91);
  });
  it("guards CSV cells against spreadsheet formula injection", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(toCsv(["h"], [["x"], ["+1"]])).toBe("h\r\nx\r\n'+1");
  });
});

describe("analytics periods", () => {
  it("compares against an equally long preceding period", () => {
    const { current, previous } = resolvePeriod("week", NOW);
    expect(current.end.getTime() - current.start.getTime()).toBe(previous.end.getTime() - previous.start.getTime());
    expect(previous.end.getTime()).toBe(current.start.getTime());
    expect(inPeriod(NOW.toISOString(), current)).toBe(true);
    expect(inPeriod("2026-01-01T00:00:00Z", current)).toBe(false);
  });
  it("counts and describes change honestly", () => {
    expect(countBy(["a", "b", "a"], (x) => x)).toEqual([{ label: "a", value: 2 }, { label: "b", value: 1 }]);
    expect(delta(6, 3)).toBe("+100% vs previous period");
    expect(delta(2, 0)).toBe("new activity");
    const { current } = resolvePeriod("today", NOW);
    expect(dailyCounts([NOW.toISOString()], current).reduce((s, d) => s + d.value, 0)).toBe(1);
  });
});

describe("report validation", () => {
  it("accepts a complete observation and names each missing piece otherwise", () => {
    expect(validatePayload(syntheticPayload())).toEqual([]);
    const problems = validatePayload({ ...syntheticPayload(), reportType: null, location: null, description: "" });
    expect(problems.join(" ")).toMatch(/what happened/i);
    expect(problems.join(" ")).toMatch(/location/i);
    expect(problems.join(" ")).toMatch(/description/i);
  });
  it("rejects impossible accuracy and out-of-range coordinates", () => {
    const p = syntheticPayload({ location: { latitude: 120, longitude: 91, accuracy_m: 0, location_provider: "MANUAL_MAP_PICK" } });
    expect(validatePayload(p).length).toBeGreaterThanOrEqual(2);
  });
  it("recognises stored payloads and refuses garbage", () => {
    expect(isReportPayload(syntheticPayload())).toBe(true);
    expect(isReportPayload({ description: 3 })).toBe(false);
  });
});
