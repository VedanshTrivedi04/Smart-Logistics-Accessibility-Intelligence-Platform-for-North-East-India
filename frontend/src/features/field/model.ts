import type { LocationProvider, ReportSeverity, ReportType } from "@/shared/api";
import { REPORT_SEVERITIES, REPORT_TYPES } from "@/shared/api";
import { isValidLatLon } from "@/shared/lib/geo";
import type { OperationRecord } from "@/shared/offline";

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export interface ReportLocation {
  latitude: number;
  longitude: number;
  accuracy_m: number;
  location_provider: LocationProvider;
  altitude_m?: number | null;
}

/** What the officer captured. It is an observation; nothing here is verified. */
export interface ReportPayload {
  reportType: ReportType | null;
  severity: ReportSeverity | null;
  description: string;
  location: ReportLocation | null;
  /** When the officer saw it, not when it is sent. */
  observedAt: string;
  candidateEdgeId: string | null;
  mediaLocalIds: string[];
  laneStatus?: "BOTH_BLOCKED" | "SINGLE_LANE_OPEN" | "SHOULDER_ONLY" | "CLEAR" | null;
  passableClasses?: Array<"HEAVY_TRUCK" | "LIGHT_4X4" | "EMERGENCY_ONLY" | "NONE">;
  lifeSafetyRisk?: boolean;
  /** True while any attached photo came from the dev-only simulated camera. */
  simulatedEvidence?: boolean;
}

export function emptyPayload(now: Date): ReportPayload {
  return {
    reportType: null,
    severity: null,
    description: "",
    location: null,
    observedAt: now.toISOString(),
    candidateEdgeId: null,
    mediaLocalIds: [],
    laneStatus: null,
    passableClasses: [],
    lifeSafetyRisk: false,
  };
}

export function isReportPayload(value: unknown): value is ReportPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["description"] === "string" &&
    typeof v["observedAt"] === "string" &&
    Array.isArray(v["mediaLocalIds"]) &&
    (v["reportType"] === null || REPORT_TYPES.includes(v["reportType"] as ReportType)) &&
    (v["severity"] === null || REPORT_SEVERITIES.includes(v["severity"] as ReportSeverity))
  );
}

/** Problems that must be fixed before a report can be queued for sending. */
export function validatePayload(p: ReportPayload): string[] {
  const problems: string[] = [];
  if (!p.reportType) problems.push("Choose what happened.");
  if (!p.severity) problems.push("Choose how severe it is.");
  if (p.description.trim().length < 3) problems.push("Add a short description (at least 3 characters).");
  if (formatStructuredDescription(p).length > 2000) problems.push("The description is longer than 2000 characters (the passability summary added to it counts).");
  if (!p.location) problems.push("Add a location: use GPS or select a milestone.");
  else {
    if (!isValidLatLon(p.location.latitude, p.location.longitude)) problems.push("The coordinates are not valid.");
    if (!(p.location.accuracy_m > 0) || p.location.accuracy_m > 5000) problems.push("Location accuracy must be between 1 and 5000 metres.");
  }
  if (p.mediaLocalIds.length > MAX_PHOTOS) problems.push(`At most ${MAX_PHOTOS} photos can be attached.`);
  return problems;
}

/** A header this module wrote earlier, so re-formatting an already formatted description never stacks headers. */
const HEADER_RE = /^\[(?:LANE:|PASSABLE:|🚨 LIFE-SAFETY|DEMO:)[^\]]*\]\s*/;

/**
 * Prepend a human-readable passability header to the description for consumers that only read
 * free text. The same values are also sent as structured fields, which are what the server stores.
 */
export function formatStructuredDescription(payload: ReportPayload): string {
  const tags: string[] = [];
  if (payload.simulatedEvidence) {
    tags.push("DEMO: SIMULATED EVIDENCE, NOT A REAL OBSERVATION");
  }
  if (payload.laneStatus) {
    const laneMap: Record<string, string> = {
      BOTH_BLOCKED: "Both Lanes Blocked",
      SINGLE_LANE_OPEN: "Single Lane Open (Alternating)",
      SHOULDER_ONLY: "Shoulder Passage Only",
      CLEAR: "Passage Clear",
    };
    tags.push(`LANE: ${laneMap[payload.laneStatus] ?? payload.laneStatus}`);
  }
  if (payload.passableClasses && payload.passableClasses.length > 0) {
    const classMap: Record<string, string> = {
      HEAVY_TRUCK: "Heavy Trucks",
      LIGHT_4X4: "Light 4x4/Pickups",
      EMERGENCY_ONLY: "Emergency Only",
      NONE: "Zero Vehicles",
    };
    tags.push(`PASSABLE: ${payload.passableClasses.map((c) => classMap[c] ?? c).join(", ")}`);
  }
  if (payload.lifeSafetyRisk) {
    tags.push("🚨 LIFE-SAFETY RISK: ACTIVE");
  }

  const cleanDesc = payload.description.trim().replace(HEADER_RE, "");
  if (!tags.length) return cleanDesc;
  return `[${tags.join(" · ")}]\n\n${cleanDesc}`;
}

/** Batch-sync item in the shape POST /reports/sync expects. `client_operation_id` is the stable operation id. */
export function toBatchItem(op: Pick<OperationRecord, "id">, payload: ReportPayload, serverMediaIds: readonly string[]): Record<string, unknown> {
  if (!payload.reportType || !payload.severity || !payload.location) throw new Error("Incomplete payload cannot be sent");
  const finalDescription = formatStructuredDescription(payload);
  return {
    client_operation_id: op.id,
    report_type: payload.reportType,
    severity: payload.severity,
    description: finalDescription,
    location: {
      longitude: payload.location.longitude,
      latitude: payload.location.latitude,
      accuracy_m: payload.location.accuracy_m,
      location_provider: payload.location.location_provider,
      ...(payload.location.altitude_m !== undefined && payload.location.altitude_m !== null ? { altitude_m: payload.location.altitude_m } : {}),
    },
    observed_at: payload.observedAt,
    media_ids: [...serverMediaIds],
    ...(payload.candidateEdgeId ? { candidate_edge_id: payload.candidateEdgeId } : {}),
    ...(payload.laneStatus ? { lane_status: payload.laneStatus } : {}),
    ...(payload.passableClasses && payload.passableClasses.length > 0 ? { passable_classes: payload.passableClasses } : {}),
    ...(payload.lifeSafetyRisk !== undefined ? { life_safety_risk: payload.lifeSafetyRisk } : {}),
  };
}
