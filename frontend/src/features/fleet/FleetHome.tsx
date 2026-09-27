"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TripStatus } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { formatDateTime, formatDuration } from "@/shared/lib/time";
import { humanize, shortId } from "@/shared/lib/format";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, LocateFixed, Package, Radio, Route, ShieldAlert, Truck, User } from "lucide-react";
import { Banner, Button, Card, KeyValue, QueryState, Stat, StatusBadge } from "@/shared/ui";
import { useCommitments, useDrivers, useFleetPositions, useTrips, useVehicles } from "./queries";
import { LogisticsOverview } from "@/features/overview";

const ACTIVE_TRIP_STATUSES: readonly TripStatus[] = ["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION", "DIVERTED"];

export function FleetHome({ tripBase = "/logistics/trips", vehicleBase = "/logistics/vehicles" }: { tripBase?: string; vehicleBase?: string }) {
  const { can, principal } = useSession();
  const vehicles = useVehicles();
  const drivers = useDrivers();
  const trips = useTrips();
  const commitments = useCommitments();
  const positions = useFleetPositions(vehicles.data);

  // If user cannot view fleet, fallback to baseline LogisticsOverview
  if (!can("VIEW_FLEET")) {
    return <LogisticsOverview />;
  }

  // Derive Vehicle KPIs
  const vehicleStats = useMemo(() => {
    const list = vehicles.data ?? [];
    const activeTrips = (trips.data ?? []).filter((t) => ACTIVE_TRIP_STATUSES.includes(t.status));
    const activeVehicleIds = new Set(activeTrips.map((t) => t.vehicle_id));

    const onTrip = list.filter((v) => activeVehicleIds.has(v.id)).length;
    const inactive = list.filter((v) => !v.is_active).length;
    const available = list.filter((v) => v.is_active && !activeVehicleIds.has(v.id)).length;

    // Check positions for stale telemetry
    const staleVehicles = positions.filter((p) => p.position && p.position.stale_status !== "FRESH").length;

    return { total: list.length, onTrip, available, inactive, staleVehicles };
  }, [vehicles.data, trips.data, positions]);

  // Derive Driver KPIs
  const driverStats = useMemo(() => {
    const list = drivers.data ?? [];
    const activeTrips = (trips.data ?? []).filter((t) => ACTIVE_TRIP_STATUSES.includes(t.status));
    const activeDriverIds = new Set(activeTrips.map((t) => t.driver_id).filter(Boolean));

    const onTrip = list.filter((d) => activeDriverIds.has(d.id)).length;
    const available = list.filter((d) => d.is_active && !activeDriverIds.has(d.id)).length;
    const inactive = list.filter((d) => !d.is_active).length;

    return { total: list.length, available, onTrip, inactive };
  }, [drivers.data, trips.data]);

  // Derive Trip KPIs
  const tripStats = useMemo(() => {
    const list = trips.data ?? [];
    const planned = list.filter((t) => t.status === "PLANNED").length;
    const inTransit = list.filter((t) => t.status === "IN_TRANSIT" || t.status === "DISPATCHED").length;
    const divertedOrHeld = list.filter((t) => t.status === "DIVERTED" || t.status === "HELD_FOR_INSPECTION").length;
    const completed = list.filter((t) => t.status === "COMPLETED").length;

    return { total: list.length, planned, inTransit, divertedOrHeld, completed };
  }, [trips.data]);

  // Derive Delivery KPIs
  const deliveryStats = useMemo(() => {
    const list = commitments.data ?? [];
    const onTime = list.filter((c) => c.sla_status === "ON_TIME").length;
    const atRisk = list.filter((c) => c.sla_status === "AT_RISK").length;
    const breached = list.filter((c) => c.sla_status === "BREACHED").length;
    const delivered = list.filter((c) => c.status === "DELIVERED").length;
    const inTransit = list.filter((c) => c.status === "IN_TRANSIT" || c.status === "DISPATCHED").length;
    const unassigned = list.filter((c) => c.status === "PENDING").length;

    return { total: list.length, onTime, atRisk, breached, delivered, inTransit, unassigned };
  }, [commitments.data]);

  // Attention Items
  const attentionItems = useMemo(() => {
    const items: Array<{ id: string; tone: "danger" | "warn" | "info"; title: string; subtitle: string; link: string }> = [];

    // 1. Trips diverted or held
    (trips.data ?? [])
      .filter((t) => t.status === "DIVERTED" || t.status === "HELD_FOR_INSPECTION")
      .forEach((t) => {
        items.push({
          id: `trip-alert-${t.id}`,
          tone: "danger",
          title: `Trip ${t.trip_code} status: ${humanize(t.status)}`,
          subtitle: `Route disruption or inspection hold active · ${t.stops.length} stops planned`,
          link: `${tripBase}/${t.id}`,
        });
      });

    // 2. Commitments at risk or breached
    (commitments.data ?? [])
      .filter((c) => c.sla_status === "BREACHED" || c.sla_status === "AT_RISK")
      .slice(0, 3)
      .forEach((c) => {
        items.push({
          id: `cm-sla-${c.id}`,
          tone: c.sla_status === "BREACHED" ? "danger" : "warn",
          title: `Consignment ${c.consignment_reference} ${humanize(c.sla_status)}`,
          subtitle: `${humanize(c.cargo_category)} (${humanize(c.priority_tier)}) · Required before ${formatDateTime(c.required_before)}`,
          link: `/logistics/deliveries/${c.id}`,
        });
      });

    // 3. Stale telemetry
    positions
      .filter((p) => p.position && p.position.stale_status !== "FRESH")
      .slice(0, 3)
      .forEach((p) => {
        const pos = p.position!;
        items.push({
          id: `pos-stale-${p.vehicle.id}`,
          tone: "warn",
          title: `Telemetry ${humanize(pos.stale_status)}: ${p.vehicle.registration_number}`,
          subtitle: `Last coordinates recorded at ${formatDateTime(pos.event_at)} (${pos.speed_kph.toFixed(0)} km/h)`,
          link: `${vehicleBase}/${p.vehicle.id}`,
        });
      });

    return items;
  }, [trips.data, commitments.data, positions, vehicles.data, tripBase, vehicleBase]);

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      {/* Cockpit Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1.25rem 1.5rem",
          borderRadius: "14px",
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)",
          border: "1px solid rgba(56, 189, 248, 0.3)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.6rem" }}>🚚</span>
            <h1 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 700, color: "#f8fafc" }}>
              Fleet Operations Management
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.2rem 0.65rem",
                borderRadius: "20px",
                fontSize: "0.75rem",
                fontWeight: 600,
                background: "rgba(16, 185, 129, 0.2)",
                color: "#34d399",
                border: "1px solid rgba(16, 185, 129, 0.4)",
              }}
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
              OPERATIONAL
            </span>
          </div>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#94a3b8" }}>
            Real-time fleet resource tracking, vehicle/driver assignments, road disruptions, and dispatch coordination.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          {can("DISPATCH_ROUTE") && (
            <Link href="/logistics/assignments">
              <Button size="small" variant="primary">
                + New Assignment
              </Button>
            </Link>
          )}
          <Link href="/logistics/fleet">
            <Button size="small">
              <LocateFixed size={14} style={{ marginRight: "0.3rem" }} /> Live Fleet Map
            </Button>
          </Link>
        </div>
      </div>

      {/* Operational KPI Grid */}
      <div className="grid cols-4" style={{ gap: "1rem" }}>
        {/* Deliveries KPI Card */}
        <Card title="Deliveries & Consignments">
          <div className="stack" style={{ gap: "0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "2rem", fontWeight: 800, color: "#f59e0b" }}>{deliveryStats.total}</span>
              <Link href="/logistics/deliveries" className="small" style={{ color: "#f59e0b", textDecoration: "none" }}>
                All consignments →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">On Time:</span> <strong style={{ color: "#34d399" }}>{deliveryStats.onTime}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">At Risk:</span> <strong style={{ color: deliveryStats.atRisk > 0 ? "#f59e0b" : "inherit" }}>{deliveryStats.atRisk}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">Unassigned:</span> <strong style={{ color: deliveryStats.unassigned > 0 ? "#f97316" : "inherit" }}>{deliveryStats.unassigned}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">Delivered:</span> <strong>{deliveryStats.delivered}</strong>
              </div>
            </div>
          </div>
        </Card>

        {/* Vehicles KPI Card */}
        <Card title="Vehicles Overview">
          <div className="stack" style={{ gap: "0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "2rem", fontWeight: 800, color: "#38bdf8" }}>{vehicleStats.total}</span>
              <Link href="/logistics/vehicles" className="small" style={{ color: "#38bdf8", textDecoration: "none" }}>
                Manage vehicles →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">On Trip:</span> <strong>{vehicleStats.onTrip}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">Available:</span> <strong>{vehicleStats.available}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">Inactive:</span> <strong>{vehicleStats.inactive}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">Stale Telemetry:</span> <strong style={{ color: vehicleStats.staleVehicles > 0 ? "#f59e0b" : "inherit" }}>{vehicleStats.staleVehicles}</strong>
              </div>
            </div>
          </div>
        </Card>

        {/* Drivers KPI Card */}
        <Card title="Drivers Roster">
          <div className="stack" style={{ gap: "0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "2rem", fontWeight: 800, color: "#34d399" }}>{driverStats.total}</span>
              <Link href="/logistics/drivers" className="small" style={{ color: "#34d399", textDecoration: "none" }}>
                View roster →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">Available:</span> <strong style={{ color: "#34d399" }}>{driverStats.available}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">On Trip:</span> <strong>{driverStats.onTrip}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">Inactive:</span> <strong>{driverStats.inactive}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">Ready to Assign:</span> <strong>{driverStats.available}</strong>
              </div>
            </div>
          </div>
        </Card>

        {/* Trips KPI Card */}
        <Card title="Active Logistics Trips">
          <div className="stack" style={{ gap: "0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "2rem", fontWeight: 800, color: "#a855f7" }}>{tripStats.inTransit + tripStats.planned}</span>
              <Link href="/logistics/trips" className="small" style={{ color: "#a855f7", textDecoration: "none" }}>
                All trips ({tripStats.total}) →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">In Transit:</span> <strong>{tripStats.inTransit}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">Planned:</span> <strong>{tripStats.planned}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">Disrupted/Held:</span> <strong style={{ color: tripStats.divertedOrHeld > 0 ? "#ef4444" : "inherit" }}>{tripStats.divertedOrHeld}</strong>
              </div>
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.03)" }}>
                <span className="small muted">Completed:</span> <strong>{tripStats.completed}</strong>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Needs Attention Panel */}
      {attentionItems.length > 0 && (
        <Card title="⚠️ Needs Operational Attention">
          <div className="stack" style={{ gap: "0.6rem" }}>
            {attentionItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  background:
                    item.tone === "danger"
                      ? "rgba(239, 68, 68, 0.08)"
                      : item.tone === "warn"
                      ? "rgba(245, 158, 11, 0.08)"
                      : "rgba(56, 189, 248, 0.08)",
                  borderLeft: `4px solid ${
                    item.tone === "danger" ? "#ef4444" : item.tone === "warn" ? "#f59e0b" : "#38bdf8"
                  }`,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{item.title}</div>
                  <div className="small muted" style={{ marginTop: "0.15rem" }}>
                    {item.subtitle}
                  </div>
                </div>
                <Link href={item.link}>
                  <Button size="small" variant={item.tone === "danger" ? "danger" : "default"}>
                    Inspect <ArrowRight size={12} style={{ marginLeft: "0.25rem" }} />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Access Matrix */}
      <div className="grid cols-6" style={{ gap: "0.75rem" }}>
        <Link href="/logistics/deliveries" style={{ textDecoration: "none" }}>
          <div
            style={{
              padding: "0.85rem",
              borderRadius: "10px",
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              cursor: "pointer",
            }}
          >
            <div style={{ padding: "0.5rem", borderRadius: "8px", background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
              <Package size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.9rem" }}>Deliveries</div>
              <div className="small muted" style={{ fontSize: "0.75rem" }}>Consignments & SLA</div>
            </div>
          </div>
        </Link>

        <Link href="/logistics/vehicles" style={{ textDecoration: "none" }}>
          <div
            style={{
              padding: "0.85rem",
              borderRadius: "10px",
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              cursor: "pointer",
            }}
          >
            <div style={{ padding: "0.5rem", borderRadius: "8px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8" }}>
              <Truck size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.9rem" }}>Vehicles</div>
              <div className="small muted" style={{ fontSize: "0.75rem" }}>Specs & live status</div>
            </div>
          </div>
        </Link>

        <Link href="/logistics/drivers" style={{ textDecoration: "none" }}>
          <div
            style={{
              padding: "0.85rem",
              borderRadius: "10px",
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              cursor: "pointer",
            }}
          >
            <div style={{ padding: "0.5rem", borderRadius: "8px", background: "rgba(52, 211, 153, 0.15)", color: "#34d399" }}>
              <User size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.9rem" }}>Drivers</div>
              <div className="small muted" style={{ fontSize: "0.75rem" }}>Roster & status</div>
            </div>
          </div>
        </Link>

        <Link href="/logistics/trips" style={{ textDecoration: "none" }}>
          <div
            style={{
              padding: "0.85rem",
              borderRadius: "10px",
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              cursor: "pointer",
            }}
          >
            <div style={{ padding: "0.5rem", borderRadius: "8px", background: "rgba(168, 85, 247, 0.15)", color: "#a855f7" }}>
              <Route size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.9rem" }}>Trips</div>
              <div className="small muted" style={{ fontSize: "0.75rem" }}>Active & historical</div>
            </div>
          </div>
        </Link>

        <Link href="/logistics/assignments" style={{ textDecoration: "none" }}>
          <div
            style={{
              padding: "0.85rem",
              borderRadius: "10px",
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              cursor: "pointer",
            }}
          >
            <div style={{ padding: "0.5rem", borderRadius: "8px", background: "rgba(99, 102, 241, 0.15)", color: "#818cf8" }}>
              <Package size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.9rem" }}>Assignments</div>
              <div className="small muted" style={{ fontSize: "0.75rem" }}>Dispatch wizard</div>
            </div>
          </div>
        </Link>

        <Link href="/logistics/disruptions" style={{ textDecoration: "none" }}>
          <div
            style={{
              padding: "0.85rem",
              borderRadius: "10px",
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              cursor: "pointer",
            }}
          >
            <div style={{ padding: "0.5rem", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", color: "#ef4444" }}>
              <AlertTriangle size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.9rem" }}>Disruptions</div>
              <div className="small muted" style={{ fontSize: "0.75rem" }}>Reroutes & impacts</div>
            </div>
          </div>
        </Link>
      </div>

      {/* Live Fleet Preview Table */}
      <Card title="Active In-Transit Trips">
        <QueryState
          query={trips}
          subject="trips"
          isEmpty={(rows) => rows.filter((t) => ACTIVE_TRIP_STATUSES.includes(t.status)).length === 0}
          emptyMessage="No trips currently in-transit."
        >
          {(rows) => {
            const activeList = rows.filter((t) => ACTIVE_TRIP_STATUSES.includes(t.status));
            return (
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Active Trips</caption>
                  <thead>
                    <tr>
                      <th scope="col">Trip Code</th>
                      <th scope="col">Vehicle</th>
                      <th scope="col">Driver</th>
                      <th scope="col">Status</th>
                      <th scope="col">Scheduled Departure</th>
                      <th scope="col">Stops</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeList.map((t) => {
                      const v = vehicles.data?.find((x) => x.id === t.vehicle_id);
                      const d = drivers.data?.find((x) => x.id === t.driver_id);
                      return (
                        <tr key={t.id}>
                          <td>
                            <Link href={`${tripBase}/${t.id}`} style={{ fontWeight: 600 }}>
                              {t.trip_code}
                            </Link>
                          </td>
                          <td>
                            {v ? (
                              <Link href={`${vehicleBase}/${v.id}`}>{v.registration_number}</Link>
                            ) : (
                              shortId(t.vehicle_id)
                            )}
                          </td>
                          <td>{d ? d.full_name : <span className="muted">—</span>}</td>
                          <td>
                            <StatusBadge kind="trip" value={t.status} />
                          </td>
                          <td>{formatDateTime(t.scheduled_departure)}</td>
                          <td>{t.stops.length} stop{t.stops.length === 1 ? "" : "s"}</td>
                          <td>
                            <Link href={`${tripBase}/${t.id}`}>
                              <Button size="small">Details</Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          }}
        </QueryState>
      </Card>
    </div>
  );
}
