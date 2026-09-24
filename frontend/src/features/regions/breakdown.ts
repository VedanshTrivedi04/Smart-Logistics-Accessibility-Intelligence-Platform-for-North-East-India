import type { Commitment, Facility, FacilityImpact, Incident, Jurisdiction, Report, Trip, TripImpact } from "@/shared/api";
import type { EdgeFeature } from "@/features/network/edges";

export interface BreakdownInput {
  states: readonly Jurisdiction[];
  /** The state a jurisdiction id belongs to; null when unknown. */
  stateOf: (jurisdictionId: string | null | undefined) => Jurisdiction | null;
  incidents: readonly Incident[];
  /** Reports are the only source of an incident's jurisdiction. Without them incidents cannot be placed. */
  reports: readonly Report[];
  edges: readonly EdgeFeature[];
  facilities: readonly Facility[];
  facilityImpacts: ReadonlyArray<{ impact: FacilityImpact; facility: Facility }>;
  tripImpacts: ReadonlyArray<{ impact: TripImpact; trip: Trip; commitments: Commitment[] }>;
}

export interface StateRow {
  state: Jurisdiction;
  activeIncidents: Incident[];
  criticalIncidents: number;
  unverifiedReports: number;
  roads: { total: number; blocked: EdgeFeature[]; restricted: EdgeFeature[]; caution: number };
  facilities: number;
  isolatedFacilities: Facility[];
  trips: Trip[];
  /** Consignments on affected trips whose deadline is at risk or missed. */
  atRiskDeliveries: number;
  breachedDeliveries: number;
}

export interface Unattributed {
  activeIncidents: number;
  reports: number;
  roads: number;
  facilities: number;
  trips: number;
}

export interface Breakdown {
  rows: StateRow[];
  unattributed: Unattributed;
}

/** Most affected first: critical incidents, then isolated facilities, missed deadlines, affected trips, blocked segments, active incidents. */
export function compareRows(a: StateRow, b: StateRow): number {
  return (
    b.criticalIncidents - a.criticalIncidents ||
    b.isolatedFacilities.length - a.isolatedFacilities.length ||
    b.breachedDeliveries - a.breachedDeliveries ||
    b.trips.length - a.trips.length ||
    b.roads.blocked.length - a.roads.blocked.length ||
    b.activeIncidents.length - a.activeIncidents.length ||
    a.state.name.localeCompare(b.state.name)
  );
}

/**
 * Groups already-loaded records by state. Nothing is guessed: a record whose jurisdiction is missing
 * or unknown is counted as unattributed instead of being assigned to a state. Trips carry no
 * jurisdiction, so they are placed by the incident their impact assessment is linked to.
 */
export function buildStateBreakdown(input: BreakdownInput): Breakdown {
  const rows = new Map<string, StateRow>(
    input.states.map((state) => [
      state.id,
      { state, activeIncidents: [], criticalIncidents: 0, unverifiedReports: 0, roads: { total: 0, blocked: [], restricted: [], caution: 0 }, facilities: 0, isolatedFacilities: [], trips: [], atRiskDeliveries: 0, breachedDeliveries: 0 },
    ]),
  );
  const unattributed: Unattributed = { activeIncidents: 0, reports: 0, roads: 0, facilities: 0, trips: 0 };
  const rowFor = (jurisdictionId: string | null | undefined): StateRow | null => {
    const s = input.stateOf(jurisdictionId);
    return s ? rows.get(s.id) ?? null : null;
  };

  const reportById = new Map(input.reports.map((r) => [r.id, r]));
  const incidentState = new Map<string, StateRow | null>();
  for (const i of input.incidents) {
    if (i.lifecycle !== "ACTIVE") continue;
    const row = rowFor(reportById.get(i.primary_report_id)?.jurisdiction_id);
    incidentState.set(i.id, row);
    if (!row) { unattributed.activeIncidents++; continue; }
    row.activeIncidents.push(i);
    if (i.severity === "CRITICAL") row.criticalIncidents++;
  }

  for (const r of input.reports) {
    if (r.review_state !== "SUBMITTED" && r.review_state !== "PROVISIONAL_CAUTION") continue;
    const row = rowFor(r.jurisdiction_id);
    if (row) row.unverifiedReports++;
    else unattributed.reports++;
  }

  for (const e of input.edges) {
    const row = rowFor(e.props.jurisdiction_id);
    if (!row) { unattributed.roads++; continue; }
    row.roads.total++;
    const status = e.props.accessibility_status;
    if (status === "BLOCKED") row.roads.blocked.push(e);
    else if (status === "RESTRICTED") row.roads.restricted.push(e);
    else if (status === "PROVISIONAL_CAUTION" || status === "UNKNOWN") row.roads.caution++;
  }

  for (const f of input.facilities) {
    const row = rowFor(f.jurisdiction_id);
    if (row) row.facilities++;
    else unattributed.facilities++;
  }
  const isolatedSeen = new Set<string>();
  for (const { impact, facility } of input.facilityImpacts) {
    if (!impact.isolated || isolatedSeen.has(facility.id)) continue;
    isolatedSeen.add(facility.id);
    rowFor(facility.jurisdiction_id)?.isolatedFacilities.push(facility);
  }

  const tripSeen = new Map<string, Set<string>>();
  const commitmentSeen = new Map<string, Set<string>>();
  const unattributedTrips = new Set<string>();
  for (const { impact, trip, commitments } of input.tripImpacts) {
    const row = impact.incident_id ? incidentState.get(impact.incident_id) ?? null : null;
    if (!row) { unattributedTrips.add(trip.id); continue; }
    const key = row.state.id;
    const trips = tripSeen.get(key) ?? new Set<string>();
    if (!trips.has(trip.id)) { trips.add(trip.id); row.trips.push(trip); }
    tripSeen.set(key, trips);
    const seen = commitmentSeen.get(key) ?? new Set<string>();
    for (const c of commitments) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if (c.sla_status === "BREACHED") row.breachedDeliveries++;
      else if (c.sla_status === "AT_RISK") row.atRiskDeliveries++;
    }
    commitmentSeen.set(key, seen);
  }
  unattributed.trips = unattributedTrips.size;

  return { rows: [...rows.values()].sort(compareRows), unattributed };
}
