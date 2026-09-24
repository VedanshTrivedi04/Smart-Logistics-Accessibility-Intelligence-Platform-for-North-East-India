"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatKg, humanize } from "@/shared/lib/format";
import { useNow } from "@/shared/lib/useNow";
import { MapLegend, MapView, type MapPoint } from "@/shared/map";
import { Banner, Card, KeyValue, QueryState, SourceAge, StatusBadge } from "@/shared/ui";
import { describeGps } from "./gps";
import { useBreadcrumbs, useTrips, useVehiclePosition, useVehicles } from "./queries";

export function VehicleDetail({ vehicleId, tripBase }: { vehicleId: string; tripBase: string }) {
  const vehicles = useVehicles();
  const position = useVehiclePosition(vehicleId);
  const trips = useTrips();
  const [hours, setHours] = useState(6);
  const crumbs = useBreadcrumbs(vehicleId, hours);
  const now = useNow(30_000);
  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);
  const activeTrip = trips.data?.find((t) => t.vehicle_id === vehicleId && ["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION", "DIVERTED"].includes(t.status));
  const gps = describeGps(position.data, now);

  const trail = useMemo(() => {
    const pts = [...(crumbs.data ?? [])].sort((a, b) => a.event_at.localeCompare(b.event_at)).map((b) => [b.lon, b.lat] as [number, number]);
    return pts.length > 1 ? [{ id: "trail", cls: "trail" as const, coordinates: pts }] : [];
  }, [crumbs.data]);

  return (
    <QueryState query={vehicles} subject="vehicle">
      {() =>
        !vehicle ? (
          <Banner tone="warn" title="Vehicle not found"><p className="small">It does not exist or is outside your organization.</p></Banner>
        ) : (
          <div className="split">
            <div className="stack">
              <Card title={vehicle.registration_number}>
                <KeyValue
                  items={[
                    ["Type", humanize(vehicle.vehicle_type)],
                    ["Make / model", vehicle.make_model],
                    ["Max / empty weight", `${formatKg(vehicle.max_weight_kg)} / ${formatKg(vehicle.empty_weight_kg)}`],
                    ["Dimensions (L×W×H)", `${vehicle.length_m} × ${vehicle.width_m} × ${vehicle.height_m} m`],
                    ["Axles", String(vehicle.axle_count)],
                    ["Hazmat capable", vehicle.is_hazmat_capable ? "Yes" : "No"],
                    ["Refrigerated", vehicle.is_refrigerated ? "Yes" : "No"],
                    ["Record", vehicle.is_active ? "Active" : "Inactive"],
                  ]}
                />
              </Card>
              <Card title="Current trip">
                {trips.isPending ? <p role="status" className="muted">Loading trips…</p> : activeTrip ? (
                  <div className="stack">
                    <div className="row"><Link href={`${tripBase}/${activeTrip.id}`}>{activeTrip.trip_code}</Link><StatusBadge kind="trip" value={activeTrip.status} /></div>
                    <p className="small muted">{activeTrip.stops.length} stops · {activeTrip.commitment_ids.length} consignment(s)</p>
                  </div>
                ) : <p className="muted">No active trip assigned to this vehicle.</p>}
              </Card>
            </div>
            <div className="stack">
              <Card title="GPS">
                <div className="stack">
                  <QueryState query={position} subject="GPS position">
                    {(p) => {
                      if (p === null) {
                        return <Banner tone="caution" title="No GPS position received"><p className="small">The platform has never received a fix for this vehicle. That is not the same as the vehicle being stationary.</p></Banner>;
                      }
                      const vehiclePoints: MapPoint[] = [{ id: vehicleId, kind: "vehicle", lon: p.lon, lat: p.lat, stale: gps.stale, tone: gps.stale ? "neutral" : "ok", label: `${vehicle.registration_number}: ${gps.statement}` }];
                      return (
                        <div className="stack">
                          <div className="row"><StatusBadge kind="gps" value={p.stale_status} />{p.is_simulated ? <span className="badge tone-caution">Simulated replay</span> : null}</div>
                          <p>{gps.statement}</p>
                          <KeyValue
                            items={[
                              ["Timing", <SourceAge key="s" observedAt={p.event_at} receivedAt={p.received_at} subject="Fix taken" />],
                              ["Position", `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`],
                              ["Speed / heading", `${p.speed_kph.toFixed(0)} km/h · ${p.heading_deg.toFixed(0)}°`],
                              ["Fix quality", humanize(p.fix_quality)],
                              ["Source", humanize(p.source_type)],
                              ["Battery", p.battery_pct === null ? "Not reported" : `${p.battery_pct}%`],
                            ]}
                          />
                          <MapView ariaLabel="Vehicle position and recent trail" height={280} lines={trail} points={vehiclePoints} fitBounds={[p.lon - 0.05, p.lat - 0.05, p.lon + 0.05, p.lat + 0.05]} fitKey={`${vehicleId}-${crumbs.data?.length ?? 0}`} />
                          <MapLegend lines={trail} points={vehiclePoints} />
                        </div>
                      );
                    }}
                  </QueryState>
                  <div className="field">
                    <label htmlFor="trail-hours">Recent trail</label>
                    <select id="trail-hours" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                      {[1, 6, 24, 72].map((h) => <option key={h} value={h}>Last {h} hour{h === 1 ? "" : "s"}</option>)}
                    </select>
                    <span className="hint">{crumbs.isPending ? "Loading trail…" : `${crumbs.data?.length ?? 0} recorded fixes. Anomalous-speed fixes are stored but drawn like any other; check the fix list before relying on the trail.`}</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )
      }
    </QueryState>
  );
}
