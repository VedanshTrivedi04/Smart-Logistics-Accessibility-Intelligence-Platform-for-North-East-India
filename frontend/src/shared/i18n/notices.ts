/**
 * Notification templates keyed by stable event codes. The code is the contract;
 * the text is presentation. Only reviewed templates may be registered for a
 * non-English locale: there is deliberately no machine translation here, and no
 * assumption that Hindi covers the pilot audience.
 */
export type NoticeCode =
  | "INCIDENT_CRITICAL_ACTIVE"
  | "REPORT_AWAITING_REVIEW"
  | "REPORT_MORE_INFO_REQUESTED"
  | "EDGE_BLOCKED"
  | "EDGE_RESTRICTED"
  | "FACILITY_ISOLATED"
  | "FACILITY_NO_FEASIBLE_PATH"
  | "TRIP_ROUTE_BLOCKED"
  | "TRIP_RESTRICTED_DELAY"
  | "TRIP_BRIDGE_INCOMPATIBLE"
  | "TRIP_CURFEW_CONFLICT"
  | "COMMITMENT_AT_RISK"
  | "COMMITMENT_SLA_BREACHED"
  | "VEHICLE_GPS_STALE";

export type NoticeParams = Record<string, string | number>;
export type Catalog = Partial<Record<NoticeCode, string>>;

const EN: Record<NoticeCode, string> = {
  INCIDENT_CRITICAL_ACTIVE: "Critical incident active: {title}",
  REPORT_AWAITING_REVIEW: "{type} report awaiting review ({severity})",
  REPORT_MORE_INFO_REQUESTED: "A reviewer requested more information on your {type} report",
  EDGE_BLOCKED: "Road segment {road} is blocked",
  EDGE_RESTRICTED: "Road segment {road} is restricted",
  FACILITY_ISOLATED: "Facility {facility} is isolated by a disruption",
  FACILITY_NO_FEASIBLE_PATH: "No feasible path to facility {facility} under current road status",
  TRIP_ROUTE_BLOCKED: "Trip {trip}: planned route crosses a blocked segment",
  TRIP_RESTRICTED_DELAY: "Trip {trip}: restriction ahead, estimated delay {delay}",
  TRIP_BRIDGE_INCOMPATIBLE: "Trip {trip}: bridge limit incompatible with this vehicle",
  TRIP_CURFEW_CONFLICT: "Trip {trip}: curfew conflict on the planned route",
  COMMITMENT_AT_RISK: "Delivery {ref} is at risk of missing its deadline",
  COMMITMENT_SLA_BREACHED: "Delivery {ref} has missed its deadline",
  VEHICLE_GPS_STALE: "Vehicle {vehicle}: last GPS update {age}",
};

const reviewed = new Map<string, Catalog>();

/** Register a community/operator-reviewed catalog. Unreviewed text must never be registered. */
export function registerReviewedCatalog(locale: string, catalog: Catalog): void {
  reviewed.set(locale, catalog);
}

export function clearReviewedCatalogs(): void {
  reviewed.clear();
}

export function reviewedLocales(): string[] {
  return ["en", ...reviewed.keys()];
}

/** The single pilot-approved local language for this deployment, if one was configured. */
export function pilotLocale(): string | null {
  return process.env.NEXT_PUBLIC_PILOT_LOCALE?.trim() || null;
}

function fill(template: string, params: NoticeParams): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in params ? String(params[key]) : `{${key}}`));
}

export interface RenderedNotice {
  code: NoticeCode;
  text: string;
  locale: string;
  /** True when the requested locale had no reviewed template so English was shown. */
  fellBack: boolean;
}

export function renderNotice(code: NoticeCode, params: NoticeParams, locale = "en"): RenderedNotice {
  const localized = locale !== "en" ? reviewed.get(locale)?.[code] : undefined;
  if (localized) return { code, text: fill(localized, params), locale, fellBack: false };
  return { code, text: fill(EN[code], params), locale: "en", fellBack: locale !== "en" };
}
