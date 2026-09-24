import type { NoticeCode, NoticeParams } from "@/shared/i18n";
import { formatDuration } from "@/shared/lib/time";
import type { Commitment, Facility, FacilityImpact, Incident, Report, Trip, TripImpact, VehiclePosition } from "@/shared/api";
import { humanize } from "@/shared/lib/format";

export type NoticeSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";

export interface Notice {
  id: string;
  code: NoticeCode;
  severity: NoticeSeverity;
  params: NoticeParams;
  /** When the underlying record says it happened. */
  at: string;
  href?: string;
}

export interface NoticeInput {
  incidents?: readonly Incident[];
  reports?: readonly Report[];
  /** Only reports by this user generate "more information requested" notices. */
  ownUserId?: string;
  facilityImpacts?: ReadonlyArray<{ impact: FacilityImpact; facility: Facility }>;
  tripImpacts?: ReadonlyArray<{ impact: TripImpact; trip: Trip }>;
  commitments?: readonly Commitment[];
  vehiclePositions?: ReadonlyArray<{ registration: string; vehicleId: string; position: VehiclePosition | null | undefined }>;
  edges?: ReadonlyArray<{ id: string; name: string; status: string; at: string }>;
  hrefs?: { incident?: (id: string) => string; report?: (id: string) => string; trip?: (id: string) => string; vehicle?: (id: string) => string };
}

const RANK: Record<NoticeSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3 };

function impactSeverity(s: string): NoticeSeverity {
  return s === "CRITICAL" ? "CRITICAL" : s === "HIGH" ? "HIGH" : "MEDIUM";
}

/**
 * Derive operator notices from records the server already holds. These are computed
 * views, not a delivery channel: nothing here is sent, acknowledged or escalated.
 * Event codes are stable; wording comes from reviewed templates keyed by code.
 */
export function buildNotices(input: NoticeInput): Notice[] {
  const out: Notice[] = [];
  const h = input.hrefs ?? {};

  for (const i of input.incidents ?? []) {
    if (i.lifecycle === "ACTIVE" && (i.severity === "CRITICAL" || i.severity === "HIGH")) {
      out.push({ id: `inc:${i.id}`, code: "INCIDENT_CRITICAL_ACTIVE", severity: i.severity === "CRITICAL" ? "CRITICAL" : "HIGH", params: { title: i.title }, at: i.created_at, ...(h.incident ? { href: h.incident(i.id) } : {}) });
    }
  }
  for (const r of input.reports ?? []) {
    if (input.ownUserId) {
      if (r.reporter_id === input.ownUserId && r.review_state === "MORE_INFO_NEEDED") {
        out.push({ id: `rep-info:${r.id}`, code: "REPORT_MORE_INFO_REQUESTED", severity: "HIGH", params: { type: humanize(r.report_type).toLowerCase() }, at: r.received_at, ...(h.report ? { href: h.report(r.id) } : {}) });
      }
    } else if (r.review_state === "SUBMITTED" || r.review_state === "PROVISIONAL_CAUTION") {
      out.push({ id: `rep:${r.id}`, code: "REPORT_AWAITING_REVIEW", severity: r.severity === "CRITICAL" ? "CRITICAL" : r.severity === "HIGH" ? "HIGH" : "MEDIUM", params: { type: humanize(r.report_type), severity: humanize(r.severity).toLowerCase() }, at: r.received_at, ...(h.report ? { href: h.report(r.id) } : {}) });
    }
  }
  for (const { impact, facility } of input.facilityImpacts ?? []) {
    if (impact.isolated) out.push({ id: `fac-iso:${impact.id}`, code: "FACILITY_ISOLATED", severity: facility.is_critical ? "CRITICAL" : "HIGH", params: { facility: facility.name }, at: impact.assessed_at });
    else if (impact.reachability_state === "NO_FEASIBLE_PATH") out.push({ id: `fac-nop:${impact.id}`, code: "FACILITY_NO_FEASIBLE_PATH", severity: facility.is_critical ? "CRITICAL" : "HIGH", params: { facility: facility.name }, at: impact.assessed_at });
  }
  for (const { impact, trip } of input.tripImpacts ?? []) {
    const base = { id: `trip:${impact.id}`, severity: impactSeverity(impact.severity), at: impact.assessed_at, ...(h.trip ? { href: h.trip(trip.id) } : {}) };
    const params: NoticeParams = { trip: trip.trip_code, delay: formatDuration(impact.delay_estimated_seconds) };
    const code: NoticeCode =
      impact.impact_type === "BLOCKED_ROUTE" ? "TRIP_ROUTE_BLOCKED" : impact.impact_type === "BRIDGE_INCOMPATIBLE" ? "TRIP_BRIDGE_INCOMPATIBLE" : impact.impact_type === "CURFEW_CONFLICT" ? "TRIP_CURFEW_CONFLICT" : "TRIP_RESTRICTED_DELAY";
    out.push({ ...base, code, params });
  }
  for (const c of input.commitments ?? []) {
    if (c.sla_status === "BREACHED") out.push({ id: `sla-b:${c.id}`, code: "COMMITMENT_SLA_BREACHED", severity: c.priority_tier === "TIER_1_LIFE_SAVING" ? "CRITICAL" : "HIGH", params: { ref: c.consignment_reference }, at: c.required_before });
    else if (c.sla_status === "AT_RISK") out.push({ id: `sla-r:${c.id}`, code: "COMMITMENT_AT_RISK", severity: c.priority_tier === "TIER_1_LIFE_SAVING" ? "HIGH" : "MEDIUM", params: { ref: c.consignment_reference }, at: c.required_before });
  }
  for (const v of input.vehiclePositions ?? []) {
    const p = v.position;
    if (p && (p.stale_status === "STALE_WARNING" || p.stale_status === "FEED_OFFLINE")) {
      out.push({ id: `gps:${v.vehicleId}`, code: "VEHICLE_GPS_STALE", severity: "MEDIUM", params: { vehicle: v.registration, age: p.stale_status === "FEED_OFFLINE" ? "feed offline" : "is stale" }, at: p.event_at, ...(h.vehicle ? { href: h.vehicle(v.vehicleId) } : {}) });
    }
  }
  for (const e of input.edges ?? []) {
    if (e.status === "BLOCKED") out.push({ id: `edge:${e.id}`, code: "EDGE_BLOCKED", severity: "HIGH", params: { road: e.name }, at: e.at });
    else if (e.status === "RESTRICTED") out.push({ id: `edge:${e.id}`, code: "EDGE_RESTRICTED", severity: "MEDIUM", params: { road: e.name }, at: e.at });
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.at.localeCompare(a.at));
}
