import { describe, expect, it } from "vitest";
import { emptyPayload, formatStructuredDescription, toBatchItem, validatePayload, type ReportPayload } from "@/features/field/model";

const location = { latitude: 26.15, longitude: 91.75, accuracy_m: 12, location_provider: "GPS_HARDWARE" as const };

function payload(over: Partial<ReportPayload> = {}): ReportPayload {
  return { ...emptyPayload(new Date("2026-09-25T10:00:00Z")), reportType: "LANDSLIDE", severity: "HIGH", description: "Rocks on the road", location, ...over };
}

describe("formatStructuredDescription", () => {
  it("returns the notes unchanged when nothing structured was chosen", () => {
    expect(formatStructuredDescription(payload())).toBe("Rocks on the road");
  });

  it("prepends lane, vehicle classes and life-safety tags", () => {
    const text = formatStructuredDescription(payload({ laneStatus: "SINGLE_LANE_OPEN", passableClasses: ["LIGHT_4X4"], lifeSafetyRisk: true }));
    expect(text).toContain("LANE: Single Lane Open (Alternating)");
    expect(text).toContain("PASSABLE: Light 4x4/Pickups");
    expect(text).toContain("LIFE-SAFETY RISK: ACTIVE");
    expect(text.endsWith("Rocks on the road")).toBe(true);
  });

  it("keeps the header when the officer's own notes start with a bracket", () => {
    const text = formatStructuredDescription(payload({ laneStatus: "BOTH_BLOCKED", description: "[NH-6] boulders" }));
    expect(text).toContain("LANE: Both Lanes Blocked");
    expect(text).toContain("[NH-6] boulders");
  });

  it("does not stack headers when formatting an already formatted description", () => {
    const once = formatStructuredDescription(payload({ laneStatus: "BOTH_BLOCKED" }));
    const twice = formatStructuredDescription(payload({ laneStatus: "BOTH_BLOCKED", description: once }));
    expect(twice).toBe(once);
  });

  it("marks reports that carry simulated evidence", () => {
    expect(formatStructuredDescription(payload({ simulatedEvidence: true }))).toContain("DEMO: SIMULATED EVIDENCE");
  });
});

describe("validatePayload with the passability header", () => {
  it("counts the header towards the 2000 character limit", () => {
    const notes = "x".repeat(1990);
    expect(validatePayload(payload({ description: notes }))).toEqual([]);
    expect(validatePayload(payload({ description: notes, laneStatus: "BOTH_BLOCKED", lifeSafetyRisk: true })).join(" ")).toContain("2000");
  });
});

describe("toBatchItem", () => {
  it("sends the structured passability fields", () => {
    const item = toBatchItem({ id: "op-1" }, payload({ laneStatus: "SHOULDER_ONLY", passableClasses: ["EMERGENCY_ONLY"], lifeSafetyRisk: true }), []);
    expect(item["lane_status"]).toBe("SHOULDER_ONLY");
    expect(item["passable_classes"]).toEqual(["EMERGENCY_ONLY"]);
    expect(item["life_safety_risk"]).toBe(true);
  });

  it("accepts OBSTRUCTION as a report type", () => {
    expect(toBatchItem({ id: "op-2" }, payload({ reportType: "OBSTRUCTION" }), [])["report_type"]).toBe("OBSTRUCTION");
  });
});
