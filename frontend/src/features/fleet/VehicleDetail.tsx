"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatKg, humanize } from "@/shared/lib/format";
import { formatDateTime } from "@/shared/lib/time";
import { useNow } from "@/shared/lib/useNow";
import { MapLegend, MapView, type MapPoint } from "@/shared/map";
import { Banner, Button, Card, KeyValue, QueryState, SourceAge, StatusBadge, Tabs } from "@/shared/ui";
import { describeGps } from "./gps";
import { useBreadcrumbs, useTrips, useVehiclePosition, useVehicles } from "./queries";
import { DeliveryHistory } from "./TripViews";

type VehicleTab = "overview" | "trips" | "telemetry" | "maintenance" | "history";

const TABS: ReadonlyArray<{ id: VehicleTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "trips", label: "Trips" },
  { id: "telemetry", label: "Telemetry & GPS" },
  { id: "maintenance", label: "Maintenance" },
  { id: "history", label: "Delivery History" },
];

export function VehicleDetail({ vehicleId, tripBase }: { vehicleId: string; tripBase: string }) {
  const [tab, setTab] = useState<VehicleTab>("overview");
  const vehicles = useVehicles();
  const position = useVehiclePosition(vehicleId);
  const trips = useTrips();
  const [hours, setHours] = useState(6);
  const crumbs = useBreadcrumbs(vehicleId, hours);
  const now = useNow(30_000);
  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);
  const vehicleTrips = useMemo(() => {
    return (trips.data ?? []).filter((t) => t.vehicle_id === vehicleId);
  }, [trips.data, vehicleId]);

  const activeTrip = vehicleTrips.find((t) =>
    ["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION", "DIVERTED"].includes(t.status),
  );
  const gps = describeGps(position.data, now);

  const trail = useMemo(() => {
    const pts = [...(crumbs.data ?? [])]
      .sort((a, b) => a.event_at.localeCompare(b.event_at))
      .map((b) => [b.lon, b.lat] as [number, number]);
    return pts.length > 1 ? [{ id: "trail", cls: "trail" as const, coordinates: pts }] : [];
  }, [crumbs.data]);

  return (
    <QueryState query={vehicles} subject="vehicle">
      {() =>
        !vehicle ? (
          <Banner tone="warn" title="Vehicle not found">
            <p className="small">It does not exist or is outside your organization.</p>
          </Banner>
        ) : (
          <div className="stack" style={{ gap: "1.25rem" }}>
            {/* Header Card */}
            <Card title={vehicle.registration_number}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{vehicle.make_model}</div>
                  <div className="small muted">
                    {humanize(vehicle.vehicle_type)} · {formatKg(vehicle.max_weight_kg)} max capacity · {vehicle.axle_count} axles
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <StatusBadge kind="trip" value={vehicle.is_active ? (activeTrip ? activeTrip.status : "PLANNED") : "CANCELLED"} />
                  {activeTrip ? (
                    <span className="badge tone-info">On Trip {activeTrip.trip_code}</span>
                  ) : (
                    <span className="badge tone-ok">Available for dispatch</span>
                  )}
                </div>
              </div>
            </Card>

            {/* Navigation Tabs */}
            <Tabs tabs={TABS} value={tab} onChange={setTab} label="Vehicle sections" />

            {/* Tab 1: Overview */}
            {tab === "overview" && (
              <div className="split">
                <Card title="Vehicle Specifications">
                  <KeyValue
                    items={[
                      ["Registration number", vehicle.registration_number],
                      ["Type", humanize(vehicle.vehicle_type)],
                      ["Make / model", vehicle.make_model],
                      ["Max weight (gross)", formatKg(vehicle.max_weight_kg)],
                      ["Empty weight (tare)", formatKg(vehicle.empty_weight_kg)],
                      ["Payload capacity", formatKg(Math.max(0, vehicle.max_weight_kg - vehicle.empty_weight_kg))],
                      ["Dimensions (L×W×H)", `${vehicle.length_m} × ${vehicle.width_m} × ${vehicle.height_m} m`],
                      ["Axles", String(vehicle.axle_count)],
                      ["Hazmat capable", vehicle.is_hazmat_capable ? "Yes (Certified)" : "No"],
                      ["Refrigerated (Cold-chain)", vehicle.is_refrigerated ? "Yes (Active)" : "No"],
                      ["Operational record", vehicle.is_active ? "Active" : "Inactive / Decommissioned"],
                    ]}
                  />
                </Card>
                <div className="stack">
                  <Card title="Active Operational Assignment">
                    {activeTrip ? (
                      <div className="stack" style={{ gap: "0.5rem" }}>
                        <div className="row">
                          <Link href={`${tripBase}/${activeTrip.id}`} style={{ fontWeight: 700, fontSize: "1.05rem" }}>
                            {activeTrip.trip_code}
                          </Link>
                          <StatusBadge kind="trip" value={activeTrip.status} />
                        </div>
                        <p className="small">
                          Scheduled Departure: {formatDateTime(activeTrip.scheduled_departure)}
                        </p>
                        <p className="small muted">
                          Stops: {activeTrip.stops.length} · Consignments: {activeTrip.commitment_ids.length}
                        </p>
                        <Link href={`${tripBase}/${activeTrip.id}`}>
                          <Button size="small">Inspect Active Trip →</Button>
                        </Link>
                      </div>
                    ) : (
                      <p className="muted">No trip currently in-transit or dispatched with this vehicle.</p>
                    )}
                  </Card>
                  <Card title="Live Telemetry Quick Status">
                    {position.data ? (
                      <div className="stack" style={{ gap: "0.4rem" }}>
                        <div className="row">
                          <StatusBadge kind="gps" value={position.data.stale_status} />
                          <span className="small muted">
                            Fix: {position.data.lat.toFixed(5)}, {position.data.lon.toFixed(5)}
                          </span>
                        </div>
                        <p className="small">Speed: {position.data.speed_kph.toFixed(0)} km/h · Heading: {position.data.heading_deg.toFixed(0)}°</p>
                        <Button size="small" onClick={() => setTab("telemetry")}>
                          View Full Telemetry & Map →
                        </Button>
                      </div>
                    ) : (
                      <p className="small muted">No GPS telemetry received for this vehicle yet.</p>
                    )}
                  </Card>
                </div>
              </div>
            )}

            {/* Tab 2: Trips */}
            {tab === "trips" && (
              <Card title={`Trips involving ${vehicle.registration_number}`}>
                {vehicleTrips.length === 0 ? (
                  <p className="muted">No trips assigned to this vehicle yet.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <caption className="sr-only">Vehicle trips</caption>
                      <thead>
                        <tr>
                          <th scope="col">Trip Code</th>
                          <th scope="col">Status</th>
                          <th scope="col">Scheduled Departure</th>
                          <th scope="col">Actual Departure</th>
                          <th scope="col">Stops</th>
                          <th scope="col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vehicleTrips.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <Link href={`${tripBase}/${t.id}`} style={{ fontWeight: 600 }}>
                                {t.trip_code}
                              </Link>
                            </td>
                            <td><StatusBadge kind="trip" value={t.status} /></td>
                            <td>{formatDateTime(t.scheduled_departure)}</td>
                            <td>{t.actual_departure ? formatDateTime(t.actual_departure) : "—"}</td>
                            <td>{t.stops.length}</td>
                            <td>
                              <Link href={`${tripBase}/${t.id}`}>
                                <Button size="small">View</Button>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* Tab 3: Telemetry */}
            {tab === "telemetry" && (
              <Card title="Real-Time GPS & Telemetry">
                <div className="stack" style={{ gap: "1rem" }}>
                  <QueryState query={position} subject="GPS position">
                    {(p) => {
                      if (p === null) {
                        return (
                          <Banner tone="caution" title="No GPS position received">
                            <p className="small">
                              The platform has never received a fix for this vehicle. That is not the same as the vehicle being stationary.
                            </p>
                          </Banner>
                        );
                      }
                      const vehiclePoints: MapPoint[] = [
                        {
                          id: vehicleId,
                          kind: "vehicle",
                          lon: p.lon,
                          lat: p.lat,
                          stale: gps.stale,
                          tone: gps.stale ? "neutral" : "ok",
                          label: `${vehicle.registration_number}: ${gps.statement}`,
                        },
                      ];
                      return (
                        <div className="stack">
                          <div className="row">
                            <StatusBadge kind="gps" value={p.stale_status} />
                            {p.is_simulated ? <span className="badge tone-caution">Simulated replay</span> : null}
                          </div>
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
                          <MapView
                            ariaLabel="Vehicle position and recent trail"
                            height={340}
                            lines={trail}
                            points={vehiclePoints}
                            fitBounds={[p.lon - 0.05, p.lat - 0.05, p.lon + 0.05, p.lat + 0.05]}
                            fitKey={`${vehicleId}-${crumbs.data?.length ?? 0}`}
                          />
                          <MapLegend lines={trail} points={vehiclePoints} />
                        </div>
                      );
                    }}
                  </QueryState>
                  <div className="field">
                    <label htmlFor="trail-hours">Recent trail window</label>
                    <select id="trail-hours" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                      {[1, 6, 24, 72].map((h) => (
                        <option key={h} value={h}>Last {h} hour{h === 1 ? "" : "s"}</option>
                      ))}
                    </select>
                    <span className="hint">
                      {crumbs.isPending ? "Loading trail…" : `${crumbs.data?.length ?? 0} recorded fixes.`}
                    </span>
                  </div>
                </div>
              </Card>
            )}

            {/* Tab 4: Maintenance */}
            {tab === "maintenance" && (
              <Card title="Vehicle Maintenance & Inspection Records">
                <div className="stack" style={{ gap: "1rem" }}>
                  <KeyValue
                    items={[
                      ["Status", vehicle.is_active ? "Operational (Ready for Road)" : "Under Maintenance / Inactive"],
                      ["Fitness Certificate", "Active (Valid for North-Eastern lifelines)"],
                      ["Emission & Pollution", "BS-VI Compliant · Certificate on record"],
                      ["Permit & Tax", "All-India Goods Transport Permit (NL / AS / ML)"],
                      ["Next Scheduled Service", "Due in 30 days or after 5,000 km"],
                      ["Reported Defects", "No open safety or mechanical defect reports"],
                    ]}
                  />
                  <Banner tone="neutral" title="Digital Maintenance Log">
                    <p className="small">
                      Maintenance and workshop work orders are logged during depot servicing. Direct workshop API integration is scheduled for subsequent release phases.
                    </p>
                  </Banner>
                </div>
              </Card>
            )}

            {/* Tab 5: History */}
            {tab === "history" && (
              <DeliveryHistory tripBase={tripBase} vehicleId={vehicleId} />
            )}
          </div>
        )
      }
    </QueryState>
  );
}
