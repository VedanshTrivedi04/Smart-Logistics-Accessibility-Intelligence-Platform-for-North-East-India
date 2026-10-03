import type { LocationProvider } from "@/shared/api";

export interface AccuracyTierInfo {
  tier: "green" | "amber" | "red";
  label: string;
  description: string;
  badgeBg: string;
  badgeColor: string;
  badgeBorder: string;
}

/**
 * Classifies location provider truthfully based on horizontal accuracy and source.
 * When a browser reports an accuracy worse than 100m, it's typically coarse cell/Wi-Fi triangulation.
 */
export function classifyProvider(accuracyM: number, isManual = false): LocationProvider {
  if (isManual) return "MANUAL_MAP_PICK";
  if (accuracyM > 100) return "NETWORK_COARSE";
  return "GPS_HARDWARE";
}

/**
 * Accuracy tiers with no gaps:
 * - <= 15m: Green (High precision satellite fix)
 * - 16m..50m: Amber (Mountain canyon multipath fix)
 * - > 50m: Red (Degraded fix, suggest milestone fallback)
 */
export function getAccuracyTier(accuracyM: number): AccuracyTierInfo {
  if (accuracyM <= 15) {
    return {
      tier: "green",
      label: "High Precision Fix",
      description: "Optimal satellite lock",
      badgeBg: "#dcfce7",
      badgeColor: "#15803d",
      badgeBorder: "#86efac",
    };
  }
  if (accuracyM <= 50) {
    return {
      tier: "amber",
      label: "Mountain Canyon Fix",
      description: "Multipath signal likely from cliff face",
      badgeBg: "#fef3c7",
      badgeColor: "#b45309",
      badgeBorder: "#fde047",
    };
  }
  return {
    tier: "red",
    label: "Degraded Fix",
    description: "Heavy cloud / canyon cover — consider milestone fallback",
    badgeBg: "#fee2e2",
    badgeColor: "#b91c1c",
    badgeBorder: "#fca5a5",
  };
}

/**
 * Format altitude safely as approximate GPS elevation (ellipsoidal, not true MSL).
 */
export function formatAltitude(altitudeM: number | null | undefined): string | null {
  if (altitudeM === null || altitudeM === undefined || !Number.isFinite(altitudeM)) {
    return null;
  }
  return `~${Math.round(altitudeM)} m (GPS approx.)`;
}

/**
 * Formats elapsed age of a fix (e.g. "Just now", "25s ago", "2m ago").
 */
export function formatFixAge(timestampIsoOrMs: string | number, nowMs = Date.now()): string {
  const fixTime = typeof timestampIsoOrMs === "number" ? timestampIsoOrMs : new Date(timestampIsoOrMs).getTime();
  if (Number.isNaN(fixTime)) return "Recent fix";
  const diffSec = Math.max(0, Math.floor((nowMs - fixTime) / 1000));
  if (diffSec < 5) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}
