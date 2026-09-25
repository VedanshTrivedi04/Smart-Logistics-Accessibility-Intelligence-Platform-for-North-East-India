import { describe, expect, it } from "vitest";
import { snapToCorridor, CORRIDOR_MILESTONES, LIFELINE_CORRIDOR_BBOX } from "../../src/shared/lib/corridors";

describe("Corridor snapping & chainage math", () => {
  it("correctly snaps Byrnihat checkpoint on NH-6 with high precision", () => {
    // Byrnihat checkpoint coordinates
    const lat = 26.0450;
    const lon = 91.8750;
    const result = snapToCorridor(lat, lon);

    expect(result.corridorName).toBe("NH-6");
    expect(result.isWithinCorridor).toBe(true);
    expect(result.offCorridorM).toBeLessThan(100);
    expect(result.chainageKm).toBeGreaterThanOrEqual(25);
    expect(result.chainageKm).toBeLessThanOrEqual(35);
    expect(result.formattedChainage).toContain("NH-6 · KM");
    expect(result.nearestMilestone).toContain("Byrnihat");
  });

  it("correctly snaps Jorabat junction fork", () => {
    // Jorabat coordinates
    const lat = 26.0850;
    const lon = 91.8650;
    const result = snapToCorridor(lat, lon);

    expect(["NH-6", "NH-27"]).toContain(result.corridorName);
    expect(result.isWithinCorridor).toBe(true);
    expect(result.offCorridorM).toBeLessThan(100);
    expect(result.chainageKm).toBeGreaterThanOrEqual(18);
    expect(result.chainageKm).toBeLessThanOrEqual(24);
    expect(result.nearestMilestone).toContain("Jorabat");
  });

  it("correctly flags position far away as off-corridor", () => {
    // Far off point (Tezpur north bank: 26.65, 92.80 is >50km away from NH-6 Byrnihat)
    const lat = 26.85;
    const lon = 93.50;
    const result = snapToCorridor(lat, lon);

    expect(result.isWithinCorridor).toBe(false);
    expect(result.offCorridorM).toBeGreaterThan(1500);
  });

  it("has authentic corridor milestones along NH-6 and NH-27", () => {
    expect(CORRIDOR_MILESTONES.length).toBeGreaterThanOrEqual(10);
    const sonapur = CORRIDOR_MILESTONES.find((m) => m.id === "sonapur_pass");
    expect(sonapur).toBeDefined();
    expect(sonapur?.chainageKm).toBe(222.0);
  });

  it("defines valid lifeline corridor bounding box", () => {
    expect(LIFELINE_CORRIDOR_BBOX[0]).toBeLessThan(LIFELINE_CORRIDOR_BBOX[2]);
    expect(LIFELINE_CORRIDOR_BBOX[1]).toBeLessThan(LIFELINE_CORRIDOR_BBOX[3]);
  });
});
