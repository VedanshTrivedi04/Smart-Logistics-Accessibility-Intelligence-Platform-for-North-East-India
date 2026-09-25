import { describe, expect, it } from "vitest";
import {
  classifyProvider,
  formatAltitude,
  formatFixAge,
  getAccuracyTier,
} from "@/features/field/locationLogic";

describe("locationLogic pure helpers", () => {
  describe("classifyProvider", () => {
    it("returns MANUAL_MAP_PICK when isManual is true regardless of accuracy", () => {
      expect(classifyProvider(5, true)).toBe("MANUAL_MAP_PICK");
      expect(classifyProvider(500, true)).toBe("MANUAL_MAP_PICK");
    });

    it("returns GPS_HARDWARE for horizontal accuracy <= 100m", () => {
      expect(classifyProvider(8, false)).toBe("GPS_HARDWARE");
      expect(classifyProvider(15, false)).toBe("GPS_HARDWARE");
      expect(classifyProvider(100, false)).toBe("GPS_HARDWARE");
    });

    it("returns NETWORK_COARSE for horizontal accuracy > 100m", () => {
      expect(classifyProvider(101, false)).toBe("NETWORK_COARSE");
      expect(classifyProvider(600, false)).toBe("NETWORK_COARSE");
    });
  });

  describe("getAccuracyTier", () => {
    it("returns green for <= 15m", () => {
      const tier = getAccuracyTier(12);
      expect(tier.tier).toBe("green");
      expect(tier.label).toBe("High Precision Fix");
    });

    it("returns amber for 16m..50m with no gap at 45m..50m", () => {
      const tier16 = getAccuracyTier(16);
      expect(tier16.tier).toBe("amber");
      expect(tier16.label).toBe("Mountain Canyon Fix");

      const tier48 = getAccuracyTier(48);
      expect(tier48.tier).toBe("amber");

      const tier50 = getAccuracyTier(50);
      expect(tier50.tier).toBe("amber");
    });

    it("returns red for > 50m", () => {
      const tier51 = getAccuracyTier(51);
      expect(tier51.tier).toBe("red");
      expect(tier51.label).toBe("Degraded Fix");
    });
  });

  describe("formatAltitude", () => {
    it("formats approximate GPS altitude", () => {
      expect(formatAltitude(1420.4)).toBe("~1420 m (GPS approx.)");
      expect(formatAltitude(null)).toBeNull();
      expect(formatAltitude(undefined)).toBeNull();
    });
  });

  describe("formatFixAge", () => {
    const now = 1700000000000;

    it("formats very recent fixes as Just now", () => {
      expect(formatFixAge(now - 2000, now)).toBe("Just now");
    });

    it("formats seconds ago", () => {
      expect(formatFixAge(now - 25000, now)).toBe("25s ago");
    });

    it("formats minutes ago", () => {
      expect(formatFixAge(now - 150000, now)).toBe("2m ago");
    });
  });
});
