import type { LaneStatus, ReportSeverity } from "@/shared/api";
import { emptyPayload, type ReportLocation, type ReportPayload } from "./model";

/**
 * A field officer's observation of one road segment's current condition ("one lane is open again",
 * "still blocked"). It travels through the same offline queue as an incident report, so it works with
 * no signal. It is an observation only: it never changes road status by itself. A verifier reads it and
 * decides, because a wrong "open" is far more dangerous than a wrong "blocked".
 */
export type ObservedRoadStatus = "OPEN" | "RESTRICTED" | "BLOCKED";

interface StatusMapping {
  label: string;
  hint: string;
  laneStatus: LaneStatus;
  severity: ReportSeverity;
}

export const OBSERVED_STATUS: Record<ObservedRoadStatus, StatusMapping> = {
  OPEN: { label: "Open", hint: "Full carriageway usable again", laneStatus: "CLEAR", severity: "LOW" },
  RESTRICTED: { label: "Restricted", hint: "One lane, slow or weight-limited", laneStatus: "SINGLE_LANE_OPEN", severity: "MEDIUM" },
  BLOCKED: { label: "Blocked", hint: "Impassable or closed", laneStatus: "BOTH_BLOCKED", severity: "CRITICAL" },
};

export const CONDITION_NOTE_CHIPS = [
  "Debris cleared from the carriageway",
  "Temporary bypass in use",
  "Only one lane open, alternating traffic",
  "Heavy vehicles still cannot pass",
  "Repair crew and machinery on site",
] as const;

export interface RoadConditionInput {
  status: ObservedRoadStatus;
  notes: string;
  edgeId: string;
  edgeLabel: string;
  location: ReportLocation;
  now?: Date;
}

export function buildRoadConditionPayload({ status, notes, edgeId, edgeLabel, location, now = new Date() }: RoadConditionInput): ReportPayload {
  const m = OBSERVED_STATUS[status];
  const text = notes.trim();
  return {
    ...emptyPayload(now),
    reportType: "ROAD_CONDITION_UPDATE",
    severity: m.severity,
    description: `${edgeLabel}: seen ${m.label.toLowerCase()}.${text ? ` ${text}` : ""}`,
    location,
    candidateEdgeId: edgeId,
    laneStatus: m.laneStatus,
    passableClasses: [],
    lifeSafetyRisk: false,
  };
}
