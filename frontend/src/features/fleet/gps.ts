import type { VehiclePosition } from "@/shared/api";
import { formatAge } from "@/shared/lib/time";

export interface GpsDescription {
  /** True only for a recent observed fix; a stale position is a last-known location, not a live one. */
  live: boolean;
  stale: boolean;
  neverReported: boolean;
  statement: string;
}

/**
 * Human-readable GPS statement. Uses the server's stale_status (computed against
 * its configured threshold) rather than guessing a threshold in the browser, and
 * never extrapolates movement from speed or heading.
 */
export function describeGps(position: VehiclePosition | null | undefined, now: Date): GpsDescription {
  if (position === null) return { live: false, stale: false, neverReported: true, statement: "No GPS position has ever been received for this vehicle" };
  if (position === undefined) return { live: false, stale: false, neverReported: false, statement: "Checking GPS…" };
  const age = formatAge(position.event_at, now);
  const simulated = position.is_simulated ? " (simulated replay, not a real vehicle)" : "";
  if (position.stale_status === "FRESH" || position.stale_status === "AGING") {
    return { live: position.stale_status === "FRESH", stale: false, neverReported: false, statement: `Last GPS update ${age}${simulated}` };
  }
  const feed = position.stale_status === "FEED_OFFLINE" ? "GPS feed offline. " : "";
  return { live: false, stale: true, neverReported: false, statement: `${feed}Last known position from ${age} — not live${simulated}` };
}
