import { humanize } from "@/shared/lib/format";

export type Tone = "ok" | "warn" | "caution" | "danger" | "info" | "neutral" | "unknown";
export type IconKey = "check" | "alert" | "block" | "help" | "clock" | "loader" | "wifi-off" | "shield" | "eye" | "send" | "dot" | "x" | "user-x" | "truck";

export type StatusKind =
  | "access"
  | "severity"
  | "review"
  | "lifecycle"
  | "trip"
  | "delivery"
  | "sla"
  | "gps"
  | "queue"
  | "reach"
  | "route"
  | "priority"
  | "scan"
  | "impact";

interface StatusDef {
  label: string;
  tone: Tone;
  icon: IconKey;
  description?: string;
}

const REGISTRY: Record<StatusKind, Record<string, StatusDef>> = {
  access: {
    OPEN: { label: "Open", tone: "ok", icon: "check", description: "Verified open to traffic" },
    RESTRICTED: { label: "Restricted", tone: "warn", icon: "alert", description: "Passable with restrictions" },
    BLOCKED: { label: "Blocked", tone: "danger", icon: "block", description: "Not passable" },
    PROVISIONAL_CAUTION: { label: "Caution — unverified", tone: "caution", icon: "alert", description: "Reported but not yet verified" },
    UNKNOWN: { label: "Unknown — verification required", tone: "unknown", icon: "help", description: "Road condition unknown; verification required" },
  },
  severity: {
    LOW: { label: "Low", tone: "neutral", icon: "dot" },
    MEDIUM: { label: "Medium", tone: "info", icon: "dot" },
    MODERATE: { label: "Moderate", tone: "info", icon: "dot" },
    HIGH: { label: "High", tone: "warn", icon: "alert" },
    CRITICAL: { label: "Critical", tone: "danger", icon: "alert" },
  },
  review: {
    SUBMITTED: { label: "Submitted — awaiting review", tone: "info", icon: "send" },
    PROVISIONAL_CAUTION: { label: "Provisional caution", tone: "caution", icon: "alert" },
    UNDER_REVIEW: { label: "Under review", tone: "info", icon: "eye" },
    MORE_INFO_NEEDED: { label: "More information needed", tone: "warn", icon: "help" },
    VERIFIED: { label: "Verified", tone: "ok", icon: "check" },
    REJECTED: { label: "Rejected", tone: "danger", icon: "x" },
  },
  lifecycle: {
    ACTIVE: { label: "Active", tone: "danger", icon: "alert" },
    MONITORING: { label: "Monitoring", tone: "warn", icon: "eye" },
    RESOLVED: { label: "Resolved", tone: "ok", icon: "check" },
  },
  trip: {
    PLANNED: { label: "Planned", tone: "neutral", icon: "clock" },
    DISPATCHED: { label: "Dispatched", tone: "info", icon: "send" },
    IN_TRANSIT: { label: "In transit", tone: "info", icon: "truck" },
    HELD_FOR_INSPECTION: { label: "Held for inspection", tone: "warn", icon: "alert" },
    DIVERTED: { label: "Diverted", tone: "warn", icon: "alert" },
    COMPLETED: { label: "Completed", tone: "ok", icon: "check" },
    CANCELLED: { label: "Cancelled", tone: "neutral", icon: "x" },
    ABORTED: { label: "Aborted", tone: "danger", icon: "x" },
  },
  delivery: {
    PENDING: { label: "Pending", tone: "neutral", icon: "clock" },
    DISPATCHED: { label: "Dispatched", tone: "info", icon: "send" },
    IN_TRANSIT: { label: "In transit", tone: "info", icon: "truck" },
    DELIVERED: { label: "Delivered", tone: "ok", icon: "check" },
    PARTIALLY_DELIVERED: { label: "Partially delivered", tone: "warn", icon: "alert" },
    FAILED: { label: "Failed", tone: "danger", icon: "x" },
    CANCELLED: { label: "Cancelled", tone: "neutral", icon: "x" },
  },
  sla: {
    ON_TIME: { label: "On time", tone: "ok", icon: "check" },
    AT_RISK: { label: "At risk", tone: "warn", icon: "alert" },
    BREACHED: { label: "Deadline missed", tone: "danger", icon: "alert" },
  },
  gps: {
    FRESH: { label: "GPS current", tone: "ok", icon: "check", description: "Recent observed GPS fix" },
    AGING: { label: "GPS aging", tone: "info", icon: "clock", description: "Position is getting old" },
    STALE_WARNING: { label: "GPS stale", tone: "warn", icon: "alert", description: "Last known position; not live" },
    FEED_OFFLINE: { label: "GPS feed offline", tone: "danger", icon: "wifi-off", description: "No recent data from this vehicle" },
  },
  queue: {
    QUEUED: { label: "Saved on device", tone: "info", icon: "clock" },
    UPLOADING_MEDIA: { label: "Uploading photos", tone: "info", icon: "loader" },
    SUBMITTING: { label: "Sending", tone: "info", icon: "loader" },
    SYNCED: { label: "Accepted by server", tone: "ok", icon: "check" },
    RETRY_WAIT: { label: "Will retry", tone: "warn", icon: "clock" },
    NEEDS_LOGIN: { label: "Sign in to continue", tone: "warn", icon: "user-x" },
    NEEDS_REVIEW: { label: "Needs your review", tone: "warn", icon: "eye" },
    FAILED_WITH_REASON: { label: "Rejected", tone: "danger", icon: "x" },
    DRAFT: { label: "Draft", tone: "neutral", icon: "dot" },
  },
  reach: {
    REACHABLE: { label: "Reachable", tone: "ok", icon: "check" },
    RESTRICTED_REACHABLE: { label: "Reachable with restrictions", tone: "warn", icon: "alert" },
    NO_FEASIBLE_PATH: { label: "No feasible path", tone: "danger", icon: "block" },
    INSUFFICIENT_DATA: { label: "Insufficient data", tone: "unknown", icon: "help" },
  },
  route: {
    FEASIBLE: { label: "Feasible route", tone: "ok", icon: "check" },
    NO_FEASIBLE_PATH: { label: "No feasible path", tone: "danger", icon: "block" },
    INSUFFICIENT_DATA: { label: "Insufficient data", tone: "unknown", icon: "help" },
  },
  priority: {
    TIER_1_LIFE_SAVING: { label: "Tier 1 — life saving", tone: "danger", icon: "alert" },
    TIER_2_ESSENTIAL: { label: "Tier 2 — essential", tone: "warn", icon: "dot" },
    TIER_3_STANDARD: { label: "Tier 3 — standard", tone: "neutral", icon: "dot" },
  },
  scan: {
    PENDING: { label: "Scan pending", tone: "info", icon: "clock" },
    CLEAN: { label: "Scanned clean", tone: "ok", icon: "shield" },
    INFECTED: { label: "Blocked by scan", tone: "danger", icon: "block" },
  },
  impact: {
    BLOCKED_ROUTE: { label: "Route blocked", tone: "danger", icon: "block" },
    RESTRICTED_DELAY: { label: "Restriction delay", tone: "warn", icon: "clock" },
    BRIDGE_INCOMPATIBLE: { label: "Bridge incompatible", tone: "danger", icon: "block" },
    CURFEW_CONFLICT: { label: "Curfew conflict", tone: "warn", icon: "clock" },
  },
};

export function statusDef(kind: StatusKind, value: string | null | undefined): StatusDef {
  if (!value) return { label: "Not available", tone: "unknown", icon: "help" };
  return REGISTRY[kind][value] ?? { label: humanize(value), tone: "neutral", icon: "help" };
}

export function statusLabel(kind: StatusKind, value: string | null | undefined): string {
  return statusDef(kind, value).label;
}
