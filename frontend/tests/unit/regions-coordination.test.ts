import { describe, expect, it } from "vitest";
import { buildStateBreakdown } from "@/features/regions/breakdown";
import { regionalImpactLevel } from "@/features/incidents/IncidentImpact";
import { availableActions, inspectionLabel } from "@/features/coordination/CoordinationPanel";
import type { Commitment, Facility, FacilityImpact, Incident, Jurisdiction, Report, Trip, TripImpact } from "@/shared/api";
import type { EdgeFeature } from "@/features/network/edges";

const j = (id: string, name: string, level: string, parent_id: string | null): Jurisdiction => ({ id, code: id, name, level, parent_id });
const REGION = j("r", "NER", "REGION", null);
const ASSAM = j("as", "Assam", "STATE", "r");
const MEGH = j("ml", "Meghalaya", "STATE", "r");
const DIST = j("d1", "Kamrup", "DISTRICT", "as");
const all = [REGION, ASSAM, MEGH, DIST];
const byId = new Map(all.map((x) => [x.id, x]));
const stateOf = (id: string | null | undefined): Jurisdiction | null => {
  let cur = id ? byId.get(id) : undefined;
  while (cur) {
    if (cur.level === "STATE") return cur;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return null;
};

const incident = (id: string, report: string, severity = "HIGH", lifecycle = "ACTIVE") => ({ id, primary_report_id: report, severity, lifecycle, title: id }) as unknown as Incident;
const report = (id: string, jurisdiction_id: string | null, review_state = "CONFIRMED") => ({ id, jurisdiction_id, review_state }) as unknown as Report;
const edge = (id: string, jurisdiction_id: string | null, accessibility_status: string) => ({ id, coordinates: [], props: { jurisdiction_id, accessibility_status, road_name: id, edge_index: 1 } }) as unknown as EdgeFeature;
const facility = (id: string, jurisdiction_id: string) => ({ id, jurisdiction_id, name: id }) as unknown as Facility;
const trip = (id: string) => ({ id, trip_code: id }) as unknown as Trip;
const tripImpact = (incident_id: string | null) => ({ incident_id }) as unknown as TripImpact;
const commitment = (id: string, sla_status: string) => ({ id, sla_status }) as unknown as Commitment;

describe("buildStateBreakdown", () => {
  const base = { states: [ASSAM, MEGH], stateOf, incidents: [], reports: [], edges: [], facilities: [], facilityImpacts: [], tripImpacts: [] };

  it("places incidents by their report's state, including via a district", () => {
    const b = buildStateBreakdown({ ...base, incidents: [incident("i1", "r1", "CRITICAL"), incident("i2", "r2")], reports: [report("r1", "d1"), report("r2", "ml")] });
    const assam = b.rows.find((r) => r.state.id === "as");
    expect(assam?.activeIncidents.map((i) => i.id)).toEqual(["i1"]);
    expect(assam?.criticalIncidents).toBe(1);
    expect(b.rows[0]?.state.id).toBe("as");
  });

  it("does not guess: unplaced records are counted separately", () => {
    const b = buildStateBreakdown({
      ...base,
      incidents: [incident("i1", "missing-report"), incident("i2", "r2", "HIGH", "RESOLVED")],
      reports: [report("r2", "ml")],
      edges: [edge("e1", null, "BLOCKED")],
    });
    expect(b.unattributed.activeIncidents).toBe(1);
    expect(b.unattributed.roads).toBe(1);
    expect(b.rows.every((r) => r.activeIncidents.length === 0)).toBe(true);
  });

  it("counts blocked and restricted segments per state", () => {
    const b = buildStateBreakdown({ ...base, edges: [edge("a", "as", "BLOCKED"), edge("b", "d1", "RESTRICTED"), edge("c", "as", "OPEN"), edge("d", "ml", "UNKNOWN")] });
    const assam = b.rows.find((r) => r.state.id === "as");
    expect([assam?.roads.blocked.length, assam?.roads.restricted.length, assam?.roads.total]).toEqual([1, 1, 3]);
    expect(b.rows.find((r) => r.state.id === "ml")?.roads.caution).toBe(1);
  });

  it("places trips by incident and counts each trip and consignment once per state", () => {
    const t = trip("t1");
    const c = [commitment("c1", "BREACHED"), commitment("c2", "AT_RISK")];
    const b = buildStateBreakdown({
      ...base,
      incidents: [incident("i1", "r1"), incident("i2", "r1")],
      reports: [report("r1", "as")],
      tripImpacts: [
        { impact: tripImpact("i1"), trip: t, commitments: c },
        { impact: tripImpact("i2"), trip: t, commitments: c },
        { impact: tripImpact(null), trip: trip("t2"), commitments: [] },
      ],
    });
    const assam = b.rows.find((r) => r.state.id === "as");
    expect([assam?.trips.length, assam?.breachedDeliveries, assam?.atRiskDeliveries]).toEqual([1, 1, 1]);
    expect(b.unattributed.trips).toBe(1);
  });

  it("counts isolated facilities once", () => {
    const f = facility("f1", "ml");
    const impact = { isolated: true } as unknown as FacilityImpact;
    const b = buildStateBreakdown({ ...base, facilities: [f], facilityImpacts: [{ impact, facility: f }, { impact, facility: f }] });
    expect(b.rows.find((r) => r.state.id === "ml")?.isolatedFacilities.length).toBe(1);
  });
});

describe("regionalImpactLevel", () => {
  it("takes the worst recorded effect", () => {
    expect(regionalImpactLevel([], [], 0)).toBe("NONE RECORDED");
    expect(regionalImpactLevel(["LOW"], [], 0)).toBe("LOW");
    expect(regionalImpactLevel(["MODERATE"], [], 0)).toBe("MODERATE");
    expect(regionalImpactLevel(["LOW"], [], 1)).toBe("HIGH");
    expect(regionalImpactLevel([], [{ isolated: true, critical: false }], 0)).toBe("HIGH");
    expect(regionalImpactLevel([], [{ isolated: true, critical: true }], 0)).toBe("CRITICAL");
    expect(regionalImpactLevel(["CRITICAL"], [], 0)).toBe("CRITICAL");
  });
});

describe("coordination actions", () => {
  it("offers only sensible actions", () => {
    expect(availableActions(undefined, false)).toEqual(["ACKNOWLEDGE", "ESCALATE", "ASSIGN", "NOTE"]);
    expect(availableActions(undefined, true)).toContain("REQUEST_INSPECTION");
    const pending = { acknowledged: true, inspection_status: "REQUESTED" } as never;
    const acts = availableActions(pending, true);
    expect(acts).not.toContain("ACKNOWLEDGE");
    expect(acts).toContain("INSPECTION_COMPLETE");
    expect(acts).not.toContain("REQUEST_INSPECTION");
  });

  it("labels inspection state", () => {
    expect(inspectionLabel("REQUESTED")).toBe("Pending");
    expect(inspectionLabel("COMPLETED")).toBe("Completed");
    expect(inspectionLabel(undefined)).toBe("Not requested");
  });
});
