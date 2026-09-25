"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TRIP_TRANSITIONS, type Commitment, type DeliveryStatus, type TripStatus, type TripStop } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { downloadText, humanize, shortId, toCsv } from "@/shared/lib/format";
import { bboxOfCoordinates } from "@/shared/lib/geo";
import { formatDateTime, formatDuration } from "@/shared/lib/time";
import { MapLegend, MapView, type MapLine, type MapPoint } from "@/shared/map";
import { Bars, Banner, Button, Card, ErrorNotice, KeyValue, QueryState, Stat, StatusBadge, Tabs, useAnnounce } from "@/shared/ui";
import { useFacilities } from "@/features/network";
import { RouteEvaluator, type VehicleOption } from "@/features/routing";
import { useCommitments, useTrip, useTripImpacts, useTripTransition, useTrips, useVehicles } from "./queries";

const TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  PLANNED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["IN_TRANSIT", "DIVERTED", "ABORTED", "CANCELLED"],
  IN_TRANSIT: ["HELD_FOR_INSPECTION", "DIVERTED", "COMPLETED", "ABORTED"],
  HELD_FOR_INSPECTION: ["IN_TRANSIT", "DIVERTED", "ABORTED"],
  DIVERTED: ["IN_TRANSIT", "COMPLETED", "ABORTED"],
  COMPLETED: [],
  CANCELLED: [],
  ABORTED: [],
};
const CLOSING: readonly TripStatus[] = ["COMPLETED", "CANCELLED", "ABORTED"];
const STOP_TONE: Record<TripStop["status"], MapPoint["tone"]> = { PENDING: "warn", ARRIVED: "info", DEPARTED: "ok", SKIPPED: "neutral", CANCELLED: "neutral" };

type TripTab = "all" | TripStatus;
const TRIP_TABS: ReadonlyArray<{ id: TripTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "PLANNED", label: "Planned" },
  { id: "IN_TRANSIT", label: "In transit" },
  { id: "HELD_FOR_INSPECTION", label: "Held" },
  { id: "DIVERTED", label: "Diverted" },
  { id: "COMPLETED", label: "Completed" },
];

export function TripList({ tripBase }: { tripBase: string }) {
  const [tab, setTab] = useState<TripTab>("all");
  const query = useTrips(tab === "all" ? undefined : tab);
  const vehicles = useVehicles();
  const reg = (id: string) => vehicles.data?.find((v) => v.id === id)?.registration_number ?? shortId(id);
  return (
    <Card title="Trips">
      <div className="stack">
        <Tabs tabs={TRIP_TABS} value={tab} onChange={setTab} label="Trip status" />
        <QueryState query={query} subject="trips" isEmpty={(d) => d.length === 0} emptyMessage="No trips in this state for your organization.">
          {(rows) => (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Trips</caption>
                <thead><tr><th scope="col">Trip</th><th scope="col">Vehicle</th><th scope="col">Status</th><th scope="col">Scheduled departure</th><th scope="col">Stops</th></tr></thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td><Link href={`${tripBase}/${t.id}`}>{t.trip_code}</Link></td>
                      <td>{reg(t.vehicle_id)}</td>
                      <td><StatusBadge kind="trip" value={t.status} /></td>
                      <td>{formatDateTime(t.scheduled_departure)}</td>
                      <td>{t.stops.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </div>
    </Card>
  );
}

const GS_ROAD_WAYPOINTS: Array<[number, number]> = [
  [91.7350, 26.1450], [91.7550, 26.1360], [91.7850, 26.1150], [91.8150, 26.1090],
  [91.8470, 26.0950], [91.8650, 26.0850], [91.8685, 26.0750], [91.8715, 26.0630],
  [91.8735, 26.0530], [91.8750, 26.0450], [91.8770, 26.0350], [91.8790, 26.0210],
  [91.8805, 26.0080], [91.8815, 25.9920], [91.8820, 25.9780], [91.8820, 25.9650],
  [91.8828, 25.9610], [91.8835, 25.9570], [91.8840, 25.9550], [91.8835, 25.9460],
  [91.8821, 25.9360], [91.8805, 25.9260], [91.8798, 25.9180], [91.8812, 25.9100],
  [91.8810, 25.9050], [91.8825, 25.8850], [91.8840, 25.8650], [91.8850, 25.8400],
  [91.8845, 25.8200], [91.8875, 25.8000], [91.8940, 25.7800], [91.9030, 25.7650],
  [91.9120, 25.7550], [91.9110, 25.7380], [91.9095, 25.7200], [91.9065, 25.7020],
  [91.9035, 25.6850], [91.9080, 25.6650], [91.9065, 25.6600], [91.9050, 25.6550],
  [91.9010, 25.6400], [91.8975, 25.6250], [91.8950, 25.6100], [91.8935, 25.5980],
  [91.8950, 25.5950], [91.8905, 25.5890], [91.8870, 25.5830], [91.8840, 25.5780],
];

function buildRoadFollowingStopLine(stops: readonly TripStop[]): Array<[number, number]> {
  if (stops.length < 2) return [];
  const coords: Array<[number, number]> = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (!s1 || !s2) continue;

    let minIdx1 = 0;
    let minD1 = Infinity;
    let minIdx2 = 0;
    let minD2 = Infinity;

    for (let j = 0; j < GS_ROAD_WAYPOINTS.length; j++) {
      const wp = GS_ROAD_WAYPOINTS[j]!;
      const d1 = Math.hypot(wp[0] - s1.lon, wp[1] - s1.lat);
      const d2 = Math.hypot(wp[0] - s2.lon, wp[1] - s2.lat);
      if (d1 < minD1) { minD1 = d1; minIdx1 = j; }
      if (d2 < minD2) { minD2 = d2; minIdx2 = j; }
    }

    if (minD1 < 0.2 && minD2 < 0.2 && minIdx1 !== minIdx2) {
      const seg = minIdx1 < minIdx2
        ? GS_ROAD_WAYPOINTS.slice(minIdx1, minIdx2 + 1)
        : GS_ROAD_WAYPOINTS.slice(minIdx2, minIdx1 + 1).reverse();
      if (coords.length > 0) coords.pop();
      coords.push([s1.lon, s1.lat], ...seg, [s2.lon, s2.lat]);
    } else {
      if (coords.length === 0) coords.push([s1.lon, s1.lat]);
      coords.push([s2.lon, s2.lat]);
    }
  }
  return coords;
}

export function TripDetail({ tripId, vehicleBase }: { tripId: string; vehicleBase: string }) {
  const { can } = useSession();
  const announce = useAnnounce();
  const trip = useTrip(tripId);
  const impacts = useTripImpacts(tripId);
  const vehicles = useVehicles();
  const commitments = useCommitments();
  const facilities = useFacilities();
  const transition = useTripTransition();
  const [pending, setPending] = useState<TripStatus | null>(null);
  const vehicle = vehicles.data?.find((v) => v.id === trip.data?.vehicle_id);
  const linked = (commitments.data ?? []).filter((c) => trip.data?.commitment_ids.includes(c.id));
  const vehicleOptions: VehicleOption[] = vehicle ? [{ id: vehicle.id, label: vehicle.registration_number, maxWeightKg: vehicle.max_weight_kg, heightM: vehicle.height_m, hazmatCapable: vehicle.is_hazmat_capable }] : [];

  return (
    <QueryState query={trip} subject="trip">
      {(t) => {
        const first = t.stops[0];
        const last = t.stops[t.stops.length - 1];
        const priorityTier = linked.some((c) => c.priority_tier === "TIER_1_LIFE_SAVING") ? "TIER_1_LIFE_SAVING" : linked.some((c) => c.priority_tier === "TIER_2_ESSENTIAL") ? "TIER_2_ESSENTIAL" : "TIER_3_STANDARD";
        const stopPoints: MapPoint[] = t.stops.map((s, i) => ({ id: s.id, kind: "stop", lon: s.lon, lat: s.lat, label: `Stop ${i + 1}: ${humanize(s.stop_type)} · ${humanize(s.status)}`, tone: STOP_TONE[s.status], glyph: String(i + 1) }));
        const stopLineCoords = buildRoadFollowingStopLine(t.stops);
        const stopLine: MapLine[] = stopLineCoords.length > 1 ? [{ id: "planned", cls: "route_primary", coordinates: stopLineCoords }] : [];
        const stopBounds = stopLineCoords.length ? bboxOfCoordinates(stopLineCoords) : null;
        return (
          <div className="stack">
            {t.stops.length ? (
              <Card title="Trip route">
                <MapView ariaLabel="Trip stops in planned order" height={300} points={stopPoints} lines={stopLine} fitBounds={stopBounds} fitKey={t.id} />
                <MapLegend points={stopPoints} lines={stopLine} />
              </Card>
            ) : null}
            <div className="split">
              <Card title={t.trip_code}>
                <div className="stack">
                  <StatusBadge kind="trip" value={t.status} />
                  <KeyValue
                    items={[
                      ["Vehicle", vehicle ? <Link key="v" href={`${vehicleBase}/${vehicle.id}`}>{vehicle.registration_number}</Link> : shortId(t.vehicle_id)],
                      ["Scheduled departure", formatDateTime(t.scheduled_departure)],
                      ["Actual departure", t.actual_departure ? formatDateTime(t.actual_departure) : "Not departed"],
                      ["Actual arrival", t.actual_arrival ? formatDateTime(t.actual_arrival) : "Not arrived"],
                      ["Route snapshot", t.current_route_snapshot_id ? <span key="r" className="mono">{shortId(t.current_route_snapshot_id)}</span> : "None linked"],
                    ]}
                  />
                  {can("DISPATCH_ROUTE") && TRANSITIONS[t.status].length ? (
                    <div className="stack">
                      <h3>Change trip status</h3>
                      <p className="small muted">The status changes on screen only after the server accepts it.</p>
                      <div className="row">
                        {TRANSITIONS[t.status].filter((s) => TRIP_TRANSITIONS.includes(s)).map((s) => (
                          <Button key={s} size="small" onClick={() => (CLOSING.includes(s) ? setPending(s) : transition.mutate({ tripId: t.id, target: s }, { onSuccess: () => announce(`Trip is now ${humanize(s)}`) }))} disabled={transition.isPending}>
                            {humanize(s)}
                          </Button>
                        ))}
                      </div>
                      {pending ? (
                        <Banner tone="warn" title={`Confirm: ${humanize(pending)}`}>
                          <p className="small">This ends the trip and cannot be undone.</p>
                          <div className="row">
                            <Button size="small" variant="danger" onClick={() => { transition.mutate({ tripId: t.id, target: pending }, { onSuccess: () => announce(`Trip is now ${humanize(pending)}`) }); setPending(null); }}>Confirm {humanize(pending)}</Button>
                            <Button size="small" onClick={() => setPending(null)}>Cancel</Button>
                          </div>
                        </Banner>
                      ) : null}
                      {transition.isError ? <ErrorNotice error={transition.error} subject="this status change" /> : null}
                    </div>
                  ) : null}
                </div>
              </Card>
              <Card title="Stops">
                <ol className="timeline">
                  {t.stops.map((s) => (
                    <li key={s.id}>
                      <strong>{humanize(s.stop_type)}</strong> <StatusBadge kind="delivery" value={s.status === "ARRIVED" ? "IN_TRANSIT" : s.status === "DEPARTED" ? "DELIVERED" : s.status === "SKIPPED" || s.status === "CANCELLED" ? "CANCELLED" : "PENDING"} label={humanize(s.status)} />
                      <div className="small muted">Planned {formatDateTime(s.planned_arrival)} → {formatDateTime(s.planned_departure)}</div>
                      <div className="small muted">Actual: {s.actual_arrival ? formatDateTime(s.actual_arrival) : "not arrived"}{s.actual_departure ? ` → ${formatDateTime(s.actual_departure)}` : ""}</div>
                      <div className="small muted">{s.lat.toFixed(4)}, {s.lon.toFixed(4)}</div>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            <Card title="Disruption impacts on this trip">
              <QueryState query={impacts} subject="impacts" isEmpty={(d) => d.length === 0} emptyMessage="No active disruption impacts recorded for this trip. This reflects assessed impacts only; it is not a guarantee the route is clear.">
                {(list) => (
                  <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {list.map((i) => (
                      <li key={i.id}>
                        <div className="row"><StatusBadge kind="impact" value={i.impact_type} /><StatusBadge kind="severity" value={i.severity} /><span className="badge tone-info">{humanize(i.recommended_action)}</span></div>
                        <div className="small muted">Estimated delay {formatDuration(i.delay_estimated_seconds)} · {i.distance_to_disruption_meters === null ? "distance unknown" : `${Math.round(i.distance_to_disruption_meters / 1000)} km ahead`} · assessed {formatDateTime(i.assessed_at)} (status version {i.source_status_version}, assessment {i.assessment_version})</div>
                      </li>
                    ))}
                  </ul>
                )}
              </QueryState>
            </Card>

            <Card title="Consignments on this trip">
              {linked.length ? <CommitmentTable rows={linked} /> : <p className="muted">No consignments are linked to this trip.</p>}
            </Card>

            {can("COMPUTE_ROUTE") ? (
              <>
                <h2>Route alternatives and dispatch decision</h2>
                <RouteEvaluator
                  facilities={facilities.data ?? []}
                  vehicles={vehicleOptions}
                  tripId={t.id}
                  canDecide={can("DISPATCH_ROUTE")}
                  initial={{ ...(first?.facility_id ? { originFacilityId: first.facility_id } : {}), ...(last?.facility_id ? { destinationFacilityId: last.facility_id } : {}), vehicleId: t.vehicle_id, ...(vehicle ? { maxWeightKg: vehicle.max_weight_kg } : {}), priority: priorityTier }}
                />
              </>
            ) : null}
          </div>
        );
      }}
    </QueryState>
  );
}

export function CommitmentTable({ rows }: { rows: readonly Commitment[] }) {
  const facilities = useFacilities();
  const name = (id: string) => facilities.data?.find((f) => f.id === id)?.name ?? shortId(id);
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Consignments</caption>
        <thead><tr><th scope="col">Consignment</th><th scope="col">Priority</th><th scope="col">Route</th><th scope="col">Status</th><th scope="col">Deadline</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>{c.consignment_reference}<div className="small muted">{humanize(c.cargo_category)} · {c.delivered_quantity_units}/{c.consigned_quantity_units} units</div></td>
              <td><StatusBadge kind="priority" value={c.priority_tier} /></td>
              <td>{name(c.origin_facility_id)} → {name(c.destination_facility_id)}</td>
              <td><div className="stack" style={{ gap: "0.25rem" }}><StatusBadge kind="delivery" value={c.status} /><StatusBadge kind="sla" value={c.sla_status} />{c.shortage_reason ? <span className="small">Shortage: {c.shortage_reason}</span> : null}</div></td>
              <td>{formatDateTime(c.required_before)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TIER_ORDER = { TIER_1_LIFE_SAVING: 0, TIER_2_ESSENTIAL: 1, TIER_3_STANDARD: 2 } as const;

export function CommitmentList() {
  const [status, setStatus] = useState<"all" | DeliveryStatus>("all");
  const { can } = useSession();
  const query = useCommitments(status === "all" ? undefined : status);
  const sorted = useMemo(() => [...(query.data ?? [])].sort((a, b) => TIER_ORDER[a.priority_tier] - TIER_ORDER[b.priority_tier] || a.required_before.localeCompare(b.required_before)), [query.data]);
  const counts = useMemo(() => {
    const d = query.data ?? [];
    return { total: d.length, atRisk: d.filter((c) => c.sla_status === "AT_RISK").length, breached: d.filter((c) => c.sla_status === "BREACHED").length, critical: d.filter((c) => c.priority_tier === "TIER_1_LIFE_SAVING" && c.sla_status !== "ON_TIME").length };
  }, [query.data]);
  return (
    <Card
      title="Deliveries and consignments"
      actions={can("EXPORT_DATA") && sorted.length ? <Button size="small" onClick={() => downloadText("consignments.csv", toCsv(["reference", "category", "priority", "status", "sla", "deadline"], sorted.map((c) => [c.consignment_reference, c.cargo_category, c.priority_tier, c.status, c.sla_status, c.required_before])))}>Export CSV</Button> : undefined}
    >
      <div className="stack">
        <div className="grid cols-4">
          <Stat label="Consignments" value={counts.total} />
          <Stat label="At risk" value={counts.atRisk} />
          <Stat label="Deadline missed" value={counts.breached} />
          <Stat label="Tier 1 not on time" value={counts.critical} />
        </div>
        <div className="field">
          <label htmlFor="cm-status">Status</label>
          <select id="cm-status" value={status} onChange={(e) => setStatus(e.target.value as "all" | DeliveryStatus)} style={{ maxWidth: 260 }}>
            <option value="all">All</option>
            {(["PENDING", "DISPATCHED", "IN_TRANSIT", "DELIVERED", "PARTIALLY_DELIVERED", "FAILED", "CANCELLED"] as const).map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </select>
        </div>
        <QueryState query={query} subject="consignments" isEmpty={() => sorted.length === 0} emptyMessage="No consignments for your organization in this state.">
          {() => <CommitmentTable rows={sorted} />}
        </QueryState>
      </div>
    </Card>
  );
}

/** Delivery history and performance, derived from real completed trips. Nothing is estimated. */
export function DeliveryHistory({ tripBase }: { tripBase: string }) {
  const trips = useTrips();
  const rows = useMemo(() => {
    return (trips.data ?? [])
      .filter((t) => ["COMPLETED", "ABORTED", "CANCELLED"].includes(t.status))
      .map((t) => {
        const lastStop = t.stops[t.stops.length - 1];
        const duration = t.actual_departure && t.actual_arrival ? (new Date(t.actual_arrival).getTime() - new Date(t.actual_departure).getTime()) / 1000 : null;
        const delay = t.actual_arrival && lastStop ? (new Date(t.actual_arrival).getTime() - new Date(lastStop.planned_arrival).getTime()) / 1000 : null;
        return { trip: t, duration, delay };
      });
  }, [trips.data]);
  const completed = rows.filter((r) => r.trip.status === "COMPLETED");
  const delays = completed.map((r) => r.delay).filter((d): d is number => d !== null);
  const late = delays.filter((d) => d > 0);
  return (
    <div className="stack">
      <div className="grid cols-4">
        <Card><Stat label="Finished trips" value={rows.length} /></Card>
        <Card><Stat label="Completed" value={completed.length} hint={rows.length ? `${Math.round((completed.length / rows.length) * 100)}% of finished trips` : undefined} /></Card>
        <Card><Stat label="Average arrival delay" value={delays.length ? formatDuration(Math.max(0, delays.reduce((a, b) => a + b, 0) / delays.length)) : "—"} hint={`${delays.length} trips with arrival data`} /></Card>
        <Card><Stat label="Arrived late" value={late.length} /></Card>
      </div>
      <Card title="History">
        <QueryState query={trips} subject="trip history" isEmpty={() => rows.length === 0} emptyMessage="No finished trips yet, so there is no performance to report.">
          {() => (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Finished trips</caption>
                <thead><tr><th scope="col">Trip</th><th scope="col">Outcome</th><th scope="col">Departed</th><th scope="col">Duration</th><th scope="col">Arrival vs plan</th></tr></thead>
                <tbody>
                  {rows.map(({ trip: t, duration, delay }) => (
                    <tr key={t.id}>
                      <td><Link href={`${tripBase}/${t.id}`}>{t.trip_code}</Link></td>
                      <td><StatusBadge kind="trip" value={t.status} /></td>
                      <td>{t.actual_departure ? formatDateTime(t.actual_departure) : "—"}</td>
                      <td>{duration === null ? "—" : formatDuration(duration)}</td>
                      <td>{delay === null ? "—" : delay > 0 ? `${formatDuration(delay)} late` : `${formatDuration(-delay)} early`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </Card>
      {rows.length ? (
        <Card title="Outcomes">
          <Bars ariaLabel="Finished trips by outcome" rows={(["COMPLETED", "ABORTED", "CANCELLED"] as const).map((s) => ({ label: humanize(s), value: rows.filter((r) => r.trip.status === s).length }))} />
        </Card>
      ) : null}
      <p className="small muted">Delay reasons are not captured by the API, so only timing is shown.</p>
    </div>
  );
}
