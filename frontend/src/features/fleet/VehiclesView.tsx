"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Trip, Vehicle, VehiclePosition, VehicleType } from "@/shared/api";
import { formatKg, humanize, shortId } from "@/shared/lib/format";
import { formatDateTime } from "@/shared/lib/time";
import { Button, Card, Field, KeyValue, QueryState, Stat, StatusBadge, Tabs } from "@/shared/ui";
import { useDrivers, useFleetPositions, useTrips, useVehicles } from "./queries";
import { CreateVehicleForm } from "./forms";

type VehicleFilterTab = "all" | "available" | "on_trip" | "maintenance" | "offline";

const VEHICLE_TABS: ReadonlyArray<{ id: VehicleFilterTab; label: string }> = [
  { id: "all", label: "All Vehicles" },
  { id: "available", label: "Available" },
  { id: "on_trip", label: "On Trip" },
  { id: "maintenance", label: "Maintenance" },
  { id: "offline", label: "Offline Telemetry" },
];

export function VehiclesView({ vehicleBase = "/logistics/vehicles", tripBase = "/logistics/trips" }: { vehicleBase?: string; tripBase?: string }) {
  const [tab, setTab] = useState<VehicleFilterTab>("all");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const vehicles = useVehicles();
  const trips = useTrips();
  const drivers = useDrivers();
  const positions = useFleetPositions(vehicles.data);

  // Active trips lookup by vehicle_id
  const activeTripsMap = useMemo(() => {
    const map = new Map<string, Trip>();
    (trips.data ?? []).forEach((t) => {
      if (["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION", "DIVERTED"].includes(t.status)) {
        map.set(t.vehicle_id, t);
      }
    });
    return map;
  }, [trips.data]);

  // Positions lookup by vehicle_id
  const positionsMap = useMemo(() => {
    const map = new Map<string, VehiclePosition | null>();
    positions.forEach((p) => {
      map.set(p.vehicle.id, p.position ?? null);
    });
    return map;
  }, [positions]);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return (vehicles.data ?? []).filter((v) => {
      // Search matching
      const matchesSearch =
        search === "" ||
        v.registration_number.toLowerCase().includes(search.toLowerCase()) ||
        v.make_model.toLowerCase().includes(search.toLowerCase()) ||
        v.vehicle_type.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      const activeTrip = activeTripsMap.get(v.id);
      const pos = positionsMap.get(v.id);

      if (tab === "available") return v.is_active && !activeTrip;
      if (tab === "on_trip") return !!activeTrip;
      if (tab === "maintenance") return !v.is_active;
      if (tab === "offline") return pos && pos.stale_status !== "FRESH";
      return true;
    });
  }, [vehicles.data, search, tab, activeTripsMap, positionsMap]);

  // Summary counts
  const counts = useMemo(() => {
    const all = vehicles.data ?? [];
    const active = all.filter((v) => activeTripsMap.has(v.id)).length;
    const avail = all.filter((v) => v.is_active && !activeTripsMap.has(v.id)).length;
    const maint = all.filter((v) => !v.is_active).length;
    const offline = all.filter((v) => {
      const p = positionsMap.get(v.id);
      return p && p.stale_status !== "FRESH";
    }).length;

    return { total: all.length, available: avail, onTrip: active, maintenance: maint, offline };
  }, [vehicles.data, activeTripsMap, positionsMap]);

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      {/* Header & Stats */}
      <div className="grid cols-5" style={{ gap: "0.75rem" }}>
        <Card><Stat label="Total Vehicles" value={counts.total} /></Card>
        <Card><Stat label="Available / Idle" value={counts.available} /></Card>
        <Card><Stat label="On Active Trip" value={counts.onTrip} /></Card>
        <Card><Stat label="Maintenance" value={counts.maintenance} /></Card>
        <Card><Stat label="Stale Telemetry" value={counts.offline} hint="GPS lag > 3 min" /></Card>
      </div>

      {/* Main Vehicles Table Card */}
      <Card
        title="Fleet Vehicles"
        actions={
          <Button
            size="small"
            variant={showAddForm ? "default" : "primary"}
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? "Close Form" : "+ Register Vehicle"}
          </Button>
        }
      >
        <div className="stack" style={{ gap: "1rem" }}>
          {showAddForm && (
            <div style={{ padding: "0.5rem 0 1rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <CreateVehicleForm />
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <Tabs tabs={VEHICLE_TABS} value={tab} onChange={setTab} label="Filter vehicles" />
            <div style={{ maxWidth: "260px" }}>
              <input
                type="search"
                placeholder="Search registration, model..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem", width: "100%" }}
              />
            </div>
          </div>

          <QueryState
            query={vehicles}
            subject="vehicles"
            isEmpty={() => filteredVehicles.length === 0}
            emptyMessage="No vehicles match the selected filter."
          >
            {() => (
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Fleet Vehicles</caption>
                  <thead>
                    <tr>
                      <th scope="col">Registration</th>
                      <th scope="col">Type & Specs</th>
                      <th scope="col">Capacity</th>
                      <th scope="col">Status</th>
                      <th scope="col">Current Trip</th>
                      <th scope="col">Driver</th>
                      <th scope="col">Telemetry</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVehicles.map((v) => {
                      const activeTrip = activeTripsMap.get(v.id);
                      const driver = activeTrip ? drivers.data?.find((d) => d.id === activeTrip.driver_id) : null;
                      const pos = positionsMap.get(v.id);

                      let statusBadge = <span className="badge tone-ok">Available</span>;
                      if (!v.is_active) {
                        statusBadge = <span className="badge tone-warn">Maintenance</span>;
                      } else if (activeTrip) {
                        statusBadge = (
                          <span className="badge tone-info" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#38bdf8" }} />
                            On Trip
                          </span>
                        );
                      }

                      return (
                        <tr key={v.id}>
                          <td>
                            <Link href={`${vehicleBase}/${v.id}`} style={{ fontWeight: 600 }}>
                              {v.registration_number}
                            </Link>
                            <div className="small muted">{v.make_model}</div>
                          </td>
                          <td>
                            <div>{humanize(v.vehicle_type)}</div>
                            <div className="small muted">{v.axle_count} axles · {v.length_m}×{v.width_m}×{v.height_m}m</div>
                          </td>
                          <td>
                            <div>{formatKg(v.max_weight_kg)} max</div>
                            <div className="small muted">Tare: {formatKg(v.empty_weight_kg)}</div>
                          </td>
                          <td>{statusBadge}</td>
                          <td>
                            {activeTrip ? (
                              <div>
                                <Link href={`${tripBase}/${activeTrip.id}`}>{activeTrip.trip_code}</Link>
                                <div className="small muted"><StatusBadge kind="trip" value={activeTrip.status} /></div>
                              </div>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>{driver ? driver.full_name : <span className="muted">—</span>}</td>
                          <td>
                            {pos ? (
                              <div>
                                <StatusBadge kind="gps" value={pos.stale_status} />
                                <div className="small muted">{pos.speed_kph.toFixed(0)} km/h</div>
                              </div>
                            ) : (
                              <span className="small muted">No fix</span>
                            )}
                          </td>
                          <td>
                            <Link href={`${vehicleBase}/${v.id}`}>
                              <Button size="small">Manage</Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </QueryState>
        </div>
      </Card>
    </div>
  );
}
