import { describe, expect, it } from "vitest";
import { buildRoadConditionPayload, OBSERVED_STATUS } from "@/features/field/roadCondition";
import { buildSmsReport, smsHref, SMS_MAX_CHARS } from "@/features/field/sms";
import { formatStructuredDescription, toBatchItem, validatePayload } from "@/features/field/model";
import { clearSnapshots, readSnapshot, saveSnapshot } from "@/shared/offline/snapshots";
import { ALICE, BOB, freshDb, syntheticPayload } from "../helpers";

describe("snapshots of server data kept for offline use", () => {
  it("returns what was saved, with the time it was fetched", async () => {
    const db = await freshDb();
    await saveSnapshot(ALICE.ownerId, "reports", [{ id: "r1" }], new Date("2026-09-25T10:00:00Z"), db);
    const snap = await readSnapshot<Array<{ id: string }>>(ALICE.ownerId, "reports", db);
    expect(snap?.data).toEqual([{ id: "r1" }]);
    expect(snap?.savedAt).toBe("2026-09-25T10:00:00.000Z");
  });

  it("never shows one user's snapshot to another user on the same device", async () => {
    const db = await freshDb();
    await saveSnapshot(ALICE.ownerId, "reports", [{ id: "alice-only" }], new Date(), db);
    expect(await readSnapshot(BOB.ownerId, "reports", db)).toBeNull();
  });

  it("overwrites the previous copy of the same name", async () => {
    const db = await freshDb();
    await saveSnapshot(ALICE.ownerId, "edges", { n: 1 }, new Date(), db);
    await saveSnapshot(ALICE.ownerId, "edges", { n: 2 }, new Date(), db);
    expect((await readSnapshot<{ n: number }>(ALICE.ownerId, "edges", db))?.data.n).toBe(2);
  });

  it("clears all snapshots on sign-out without touching the report queue or identity rows", async () => {
    const db = await freshDb();
    await saveSnapshot(ALICE.ownerId, "reports", [], new Date(), db);
    await saveSnapshot(BOB.ownerId, "reports", [], new Date(), db);
    await db.put("sync_metadata", { key: "last_principal", ownerId: ALICE.ownerId, value: { id: "p" } });
    await clearSnapshots(undefined, db);
    expect(await readSnapshot(ALICE.ownerId, "reports", db)).toBeNull();
    expect(await readSnapshot(BOB.ownerId, "reports", db)).toBeNull();
    expect((await db.get("sync_metadata", "last_principal"))?.value).toEqual({ id: "p" });
  });

  it("can clear a single owner's snapshots only", async () => {
    const db = await freshDb();
    await saveSnapshot(ALICE.ownerId, "reports", [1], new Date(), db);
    await saveSnapshot(BOB.ownerId, "reports", [2], new Date(), db);
    await clearSnapshots(ALICE.ownerId, db);
    expect(await readSnapshot(ALICE.ownerId, "reports", db)).toBeNull();
    expect(await readSnapshot(BOB.ownerId, "reports", db)).not.toBeNull();
  });
});

describe("road-condition observation", () => {
  const location = { latitude: 26.05, longitude: 91.88, accuracy_m: 15, location_provider: "GPS_HARDWARE" as const };
  const base = { edgeId: "e-1", edgeLabel: "NH-6 near Jorabat", location, now: new Date("2026-09-25T10:00:00Z") };

  it("is a road-condition report tied to the chosen road segment", () => {
    const p = buildRoadConditionPayload({ ...base, status: "RESTRICTED", notes: "one lane open" });
    expect(p.reportType).toBe("ROAD_CONDITION_UPDATE");
    expect(p.candidateEdgeId).toBe("e-1");
    expect(p.laneStatus).toBe("SINGLE_LANE_OPEN");
    expect(validatePayload(p)).toEqual([]);
  });

  it.each(["OPEN", "RESTRICTED", "BLOCKED"] as const)("maps %s to a lane status and severity", (status) => {
    const p = buildRoadConditionPayload({ ...base, status, notes: "" });
    expect(p.laneStatus).toBe(OBSERVED_STATUS[status].laneStatus);
    expect(p.severity).toBe(OBSERVED_STATUS[status].severity);
    expect(validatePayload(p)).toEqual([]); // still valid without extra notes
  });

  it("shows the observed status in the description and in the batch item", () => {
    const p = buildRoadConditionPayload({ ...base, status: "OPEN", notes: "debris cleared" });
    expect(formatStructuredDescription(p)).toContain("LANE: Passage Clear");
    const item = toBatchItem({ id: "op-1" }, p, []);
    expect(item["report_type"]).toBe("ROAD_CONDITION_UPDATE");
    expect(item["candidate_edge_id"]).toBe("e-1");
  });

  it("does not claim vehicle classes or a life-safety risk the officer did not report", () => {
    const p = buildRoadConditionPayload({ ...base, status: "OPEN", notes: "" });
    expect(p.passableClasses).toEqual([]);
    expect(p.lifeSafetyRisk).toBe(false);
  });
});

describe("SMS fallback", () => {
  const payload = syntheticPayload({ reportType: "LANDSLIDE", severity: "HIGH", laneStatus: "BOTH_BLOCKED", description: "Boulders across both lanes near the bridge, machinery needed urgently" });

  it("fits one SMS and carries what the control room needs", () => {
    const text = buildSmsReport(payload, { ref: "AB12CD", chainage: "NH-6 KM 12.4" });
    expect(text.length).toBeLessThanOrEqual(SMS_MAX_CHARS);
    for (const part of ["PARVA AB12CD", "LANDSLIDE", "HIGH", "26.1000,91.7000", "NH-6 KM 12.4", "BOTH-LANES-BLOCKED"]) expect(text).toContain(part);
  });

  it("stays within 160 characters however long the notes are", () => {
    const long = syntheticPayload({ description: "x".repeat(2000) });
    expect(buildSmsReport(long, { ref: "ZZ99YY", chainage: "NH-27 KM 88.8" }).length).toBeLessThanOrEqual(SMS_MAX_CHARS);
  });

  it("uses plain ASCII only and drops the structured header from the notes", () => {
    const text = buildSmsReport(syntheticPayload({ description: "[LANE: Both Lanes Blocked]\n\nRoad closed \u{1F6A8} at kām" }), { ref: "A1" });
    expect(text).toMatch(/^[\x20-\x7E]+$/);
    expect(text).not.toContain("[LANE");
  });

  it("flags a life-safety risk", () => {
    expect(buildSmsReport(syntheticPayload({ lifeSafetyRisk: true }), { ref: "A1" })).toContain("LIFE-RISK");
  });

  it("handles a report with no GPS fix", () => {
    expect(buildSmsReport(syntheticPayload({ location: null }), { ref: "A1" })).toContain("NO-GPS");
  });

  it("builds the sms: link with the separator each platform expects", () => {
    expect(smsHref("+911234567890", "hi there", "Mozilla/5.0 (Linux; Android 14)")).toBe("sms:+911234567890?body=hi%20there");
    expect(smsHref("+911234567890", "hi there", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("sms:+911234567890&body=hi%20there");
  });
});
