"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { humanize } from "@/shared/lib/format";
import { formatDateTime } from "@/shared/lib/time";
import { useNow } from "@/shared/lib/useNow";
import { MapLegend, MapView, type MapPoint } from "@/shared/map";
import { Banner, Card, CoverageBanner, QueryState, SourceAge, StatusBadge } from "@/shared/ui";
import { describeGps } from "./gps";
import { VehiclePanel } from "./panels";
import { useFleetPositions, useTrips, useVehicles } from "./queries";

const ACTIVE_TRIP_STATUSES = ["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION", "DIVERTED"];

export function FleetMap({ vehicleBase, tripBase, routeBase }: { vehicleBase: string; tripBase: string; routeBase?: string }) {
  const vehicles = useVehicles();
  const states = useFleetPositions(vehicles.data);
  const trips = useTrips();
  const now = useNow(30_000);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const selectedState = states.find((s) => s.vehicle.id === selected) ?? null;
  const selectedTrip = selected ? trips.data?.find((t) => t.vehicle_id === selected && ACTIVE_TRIP_STATUSES.includes(t.status)) ?? null : null;

  const points = useMemo<MapPoint[]>(
    () =>
      states.flatMap((s) => {
        if (!s.position) return [];
        const gps = describeGps(s.position, now);
        return [{
          id: s.vehicle.id,
          kind: "vehicle" as const,
          lon: s.position.lon,
          lat: s.position.lat,
          stale: gps.stale,
          tone: gps.stale ? ("neutral" as const) : ("ok" as const),
          label: `${s.vehicle.registration_number}: ${gps.statement}`,
        }];
      }),
    [states, now],
  );

  const rows = states.filter((s) => (search.trim() ? s.vehicle.registration_number.toLowerCase().includes(search.trim().toLowerCase()) : true));
  const withFix = states.filter((s) => s.position).length;
  const never = states.filter((s) => s.position === null).length;
  const stale = states.filter((s) => s.position && describeGps(s.position, now).stale).length;

  return (
    <QueryState query={vehicles} subject="vehicles" isEmpty={(d) => d.length === 0} emptyMessage="No vehicles are registered for your organization yet.">
      {() => (
        <div className="stack">
          <CoverageBanner known={[{ label: "vehicles registered", count: states.length }, { label: "with a GPS position", count: withFix }]} note={`${stale} stale, ${never} never reported.`} />
          <Banner tone="info" title="Positions are observations">
            <p className="small">Markers show the last reported GPS fix. Dashed hollow markers are stale — a last known location, not a live one. Movement is never extrapolated.</p>
          </Banner>
          <div className="split">
            <div className="stack">
              <MapView ariaLabel="Fleet positions" height={480} points={points} selectedId={selected} onSelectPoint={setSelected} fitBounds={points.length ? [Math.min(...points.map((p) => p.lon)), Math.min(...points.map((p) => p.lat)), Math.max(...points.map((p) => p.lon)), Math.max(...points.map((p) => p.lat))] : null} fitKey={String(points.length)} />
              <MapLegend points={points} />
            </div>
            <div className="stack" id="map-detail-panel">
              {selectedState?.vehicle ? (
                <VehiclePanel
                  vehicle={selectedState.vehicle}
                  position={selectedState.position}
                  activeTrip={selectedTrip}
                  now={now}
                  vehicleBase={vehicleBase}
                  tripBase={tripBase}
                  routeBase={routeBase}
                  onClose={() => setSelected(null)}
                />
              ) : null}
              <Card title="Vehicles">
                <div className="field"><label className="sr-only" htmlFor="fleet-search">Search vehicles</label><input id="fleet-search" placeholder="Search registration" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <div className="table-wrap" style={{ marginTop: "0.5rem" }}>
                  <table>
                    <caption className="sr-only">Vehicles and their last GPS state</caption>
                    <thead><tr><th scope="col">Vehicle</th><th scope="col">GPS</th></tr></thead>
                    <tbody>
                      {rows.map((s) => {
                        const gps = describeGps(s.position, now);
                        return (
                          <tr key={s.vehicle.id} aria-selected={selected === s.vehicle.id} onClick={() => setSelected(s.vehicle.id)} style={{ cursor: "pointer" }}>
                            <td>
                              <Link href={`${vehicleBase}/${s.vehicle.id}`} onClick={(e) => e.stopPropagation()}>{s.vehicle.registration_number}</Link>
                              <div className="small muted">{humanize(s.vehicle.vehicle_type)}{s.vehicle.is_active ? "" : " · inactive"}</div>
                            </td>
                            <td>
                              {s.position ? <StatusBadge kind="gps" value={s.position.stale_status} /> : s.position === null ? <span className="badge tone-unknown">No fix yet</span> : <span className="muted small">Checking…</span>}
                              <div className="small">{gps.statement}</div>
                              {s.position ? <div className="small muted"><SourceAge observedAt={s.position.event_at} receivedAt={s.position.received_at} subject="Fix taken" /></div> : null}
                              {s.position ? <div className="small muted" title={formatDateTime(s.position.event_at)}>Source: {humanize(s.position.source_type)} · {humanize(s.position.fix_quality)}</div> : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </QueryState>
  );
}
