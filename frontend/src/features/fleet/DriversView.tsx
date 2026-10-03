"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Driver, Trip } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { humanize, shortId } from "@/shared/lib/format";
import { Button, Card, Field, QueryState, Stat, StatusBadge, Tabs } from "@/shared/ui";
import { useDrivers, useTrips, useVehicles } from "./queries";
import { CreateDriverForm } from "./forms";

type DriverFilterTab = "all" | "available" | "on_trip" | "inactive";

const DRIVER_TABS: ReadonlyArray<{ id: DriverFilterTab; label: string }> = [
  { id: "all", label: "All Drivers" },
  { id: "available", label: "Available" },
  { id: "on_trip", label: "On Active Trip" },
  { id: "inactive", label: "Inactive" },
];

export function DriversView({ driverBase = "/logistics/drivers", tripBase = "/logistics/trips", vehicleBase = "/logistics/vehicles" }: { driverBase?: string; tripBase?: string; vehicleBase?: string }) {
  const [tab, setTab] = useState<DriverFilterTab>("all");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const { can } = useSession();
  const drivers = useDrivers();
  const trips = useTrips();
  const vehicles = useVehicles();

  // Active trips lookup by driver_id
  const activeTripsMap = useMemo(() => {
    const map = new Map<string, Trip>();
    (trips.data ?? []).forEach((t) => {
      if (t.driver_id && ["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION", "DIVERTED"].includes(t.status)) {
        map.set(t.driver_id, t);
      }
    });
    return map;
  }, [trips.data]);

  // Filtered drivers
  const filteredDrivers = useMemo(() => {
    return (drivers.data ?? []).filter((d) => {
      const matchesSearch =
        search === "" ||
        d.full_name.toLowerCase().includes(search.toLowerCase()) ||
        d.license_number.toLowerCase().includes(search.toLowerCase()) ||
        (d.phone_e164 ?? "").includes(search);

      if (!matchesSearch) return false;

      const activeTrip = activeTripsMap.get(d.id);

      if (tab === "available") return d.is_active && !activeTrip;
      if (tab === "on_trip") return !!activeTrip;
      if (tab === "inactive") return !d.is_active;
      return true;
    });
  }, [drivers.data, search, tab, activeTripsMap]);

  // Summary counts
  const counts = useMemo(() => {
    const all = drivers.data ?? [];
    const onTrip = all.filter((d) => activeTripsMap.has(d.id)).length;
    const avail = all.filter((d) => d.is_active && !activeTripsMap.has(d.id)).length;
    const inact = all.filter((d) => !d.is_active).length;

    return { total: all.length, available: avail, onTrip, inactive: inact };
  }, [drivers.data, activeTripsMap]);

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      {/* Driver Stats */}
      <div className="grid cols-4" style={{ gap: "0.75rem" }}>
        <Card><Stat label="Total Drivers" value={counts.total} /></Card>
        <Card><Stat label="Available for Dispatch" value={counts.available} /></Card>
        <Card><Stat label="On Active Trip" value={counts.onTrip} /></Card>
        <Card><Stat label="Inactive / Leave" value={counts.inactive} /></Card>
      </div>

      {/* Main Drivers Card */}
      <Card
        title="Drivers & Operators Roster"
        actions={
          <Button
            size="small"
            variant={showAddForm ? "default" : "primary"}
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? "Close Form" : "+ Register Driver"}
          </Button>
        }
      >
        <div className="stack" style={{ gap: "1rem" }}>
          {showAddForm && (
            <div style={{ padding: "0.5rem 0 1rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <CreateDriverForm />
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <Tabs tabs={DRIVER_TABS} value={tab} onChange={setTab} label="Filter drivers" />
            <div style={{ maxWidth: "260px" }}>
              <input
                type="search"
                placeholder="Search driver name, license..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem", width: "100%" }}
              />
            </div>
          </div>

          <QueryState
            query={drivers}
            subject="drivers"
            isEmpty={() => filteredDrivers.length === 0}
            emptyMessage="No drivers match the selected filter."
          >
            {() => (
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Fleet Drivers</caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">License & Classes</th>
                      <th scope="col">Phone (E.164)</th>
                      <th scope="col">Status</th>
                      <th scope="col">Assigned Vehicle</th>
                      <th scope="col">Current Trip</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDrivers.map((d) => {
                      const activeTrip = activeTripsMap.get(d.id);
                      const vehicle = activeTrip ? vehicles.data?.find((v) => v.id === activeTrip.vehicle_id) : null;

                      let statusBadge = <span className="badge tone-ok">Available</span>;
                      if (!d.is_active) {
                        statusBadge = <span className="badge tone-warn">Inactive</span>;
                      } else if (activeTrip) {
                        statusBadge = (
                          <span className="badge tone-info" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#34d399" }} />
                            On Trip
                          </span>
                        );
                      }

                      return (
                        <tr key={d.id}>
                          <td>
                            <Link href={`${driverBase}/${d.id}`} style={{ fontWeight: 600 }}>
                              {d.full_name}
                            </Link>
                          </td>
                          <td>
                            <div>{d.license_number}</div>
                            <div className="small muted">{d.license_classes.join(", ") || "Standard"}</div>
                          </td>
                          <td>
                            {can("VIEW_DRIVER_PII") ? (
                              <span>{d.phone_e164 || "Not provided"}</span>
                            ) : (
                              <span className="small muted">Restricted (PII Guard)</span>
                            )}
                          </td>
                          <td>{statusBadge}</td>
                          <td>
                            {vehicle ? (
                              <Link href={`${vehicleBase}/${vehicle.id}`}>{vehicle.registration_number}</Link>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
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
                          <td>
                            <Link href={`${driverBase}/${d.id}`}>
                              <Button size="small">Dossier</Button>
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
