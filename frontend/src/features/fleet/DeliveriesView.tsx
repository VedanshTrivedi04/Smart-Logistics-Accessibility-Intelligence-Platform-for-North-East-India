"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DeliveryStatus } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { formatDateTime } from "@/shared/lib/time";
import { downloadText, humanize, shortId, toCsv } from "@/shared/lib/format";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  ExternalLink,
  Filter,
  Package,
  Plus,
  Route,
  Search,
  Truck,
  User,
} from "lucide-react";
import { Banner, Button, Card, PageHeader, QueryState, Stat, StatusBadge } from "@/shared/ui";
import { useFacilities } from "@/features/network";
import { useCommitments, useTrips, useVehicles, useDrivers } from "./queries";
import { CreateCommitmentForm } from "./forms";
import { DispatchOptimizer } from "./DispatchOptimizer";

const TIER_ORDER = { TIER_1_LIFE_SAVING: 0, TIER_2_ESSENTIAL: 1, TIER_3_STANDARD: 2 } as const;

export function DeliveriesView() {
  const { can } = useSession();
  const commitmentsQuery = useCommitments();
  const tripsQuery = useTrips();
  const vehiclesQuery = useVehicles();
  const driversQuery = useDrivers();
  const facilitiesQuery = useFacilities();

  const [activeTab, setActiveTab] = useState<"consignments" | "optimizer">("consignments");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "unassigned" | "transit" | "at_risk" | "partial" | "delivered">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const facilitiesMap = useMemo(() => {
    const map = new Map<string, string>();
    (facilitiesQuery.data ?? []).forEach((f) => map.set(f.id, f.name));
    return map;
  }, [facilitiesQuery.data]);

  const facilityName = (id: string) => facilitiesMap.get(id) ?? shortId(id);

  // Map commitments to their assigned trips
  const tripByCommitmentId = useMemo(() => {
    const map = new Map<string, { tripId: string; tripCode: string; vehicleId: string; driverId: string }>();
    (tripsQuery.data ?? []).forEach((t) => {
      t.commitment_ids.forEach((cid) => {
        map.set(cid, {
          tripId: t.id,
          tripCode: t.trip_code,
          vehicleId: t.vehicle_id,
          driverId: t.driver_id,
        });
      });
    });
    return map;
  }, [tripsQuery.data]);

  const allCommitments = commitmentsQuery.data ?? [];

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = allCommitments.length;
    const onTime = allCommitments.filter((c) => c.sla_status === "ON_TIME").length;
    const atRisk = allCommitments.filter((c) => c.sla_status === "AT_RISK").length;
    const breached = allCommitments.filter((c) => c.sla_status === "BREACHED").length;
    const delivered = allCommitments.filter((c) => c.status === "DELIVERED").length;
    const partial = allCommitments.filter((c) => c.status === "PARTIALLY_DELIVERED").length;
    const unassigned = allCommitments.filter((c) => c.status === "PENDING" && !tripByCommitmentId.has(c.id)).length;
    const inTransit = allCommitments.filter((c) => c.status === "IN_TRANSIT" || c.status === "DISPATCHED").length;

    return { total, onTime, atRisk, breached, delivered, partial, unassigned, inTransit };
  }, [allCommitments, tripByCommitmentId]);

  // Filtered & Sorted Deliveries
  const filteredCommitments = useMemo(() => {
    return allCommitments
      .filter((c) => {
        // Tab Filter
        if (filterMode === "unassigned") return c.status === "PENDING" && !tripByCommitmentId.has(c.id);
        if (filterMode === "transit") return c.status === "IN_TRANSIT" || c.status === "DISPATCHED";
        if (filterMode === "at_risk") return c.sla_status === "AT_RISK";
        if (filterMode === "partial") return c.status === "PARTIALLY_DELIVERED";
        if (filterMode === "delivered") return c.status === "DELIVERED";
        return true;
      })
      .filter((c) => {
        // Text Search Filter
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const refMatch = c.consignment_reference.toLowerCase().includes(q);
        const catMatch = c.cargo_category.toLowerCase().includes(q);
        const originMatch = facilityName(c.origin_facility_id).toLowerCase().includes(q);
        const destMatch = facilityName(c.destination_facility_id).toLowerCase().includes(q);
        return refMatch || catMatch || originMatch || destMatch;
      })
      .sort((a, b) => {
        // Sort priority: Life Saving first, then earliest deadline
        const pA = TIER_ORDER[a.priority_tier];
        const pB = TIER_ORDER[b.priority_tier];
        if (pA !== pB) return pA - pB;
        return a.required_before.localeCompare(b.required_before);
      });
  }, [allCommitments, filterMode, searchQuery, tripByCommitmentId, facilitiesMap]);

  const handleExportCsv = () => {
    if (!filteredCommitments.length) return;
    const csv = toCsv(
      ["Reference", "Category", "Priority", "Status", "SLA Status", "Origin", "Destination", "Deadline", "Delivered Units", "Total Units"],
      filteredCommitments.map((c) => [
        c.consignment_reference,
        c.cargo_category,
        c.priority_tier,
        c.status,
        c.sla_status,
        facilityName(c.origin_facility_id),
        facilityName(c.destination_facility_id),
        c.required_before,
        c.delivered_quantity_units,
        c.consigned_quantity_units,
      ])
    );
    downloadText(`deliveries-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      <PageHeader
        title="Deliveries & Consignments"
        subtitle="End-to-end multimodal consignment intake, priority dispatch scheduling, and destination proof of delivery."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "0.25rem", background: "rgba(0, 0, 0, 0.05)", padding: "3px", borderRadius: "8px" }}>
              <Button
                size="small"
                variant={activeTab === "consignments" ? "primary" : "default"}
                onClick={() => setActiveTab("consignments")}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Package size={14} /> Deliveries Desk
              </Button>
              <Button
                size="small"
                variant={activeTab === "optimizer" ? "primary" : "default"}
                onClick={() => setActiveTab("optimizer")}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Cpu size={14} /> Optimization-based Dispatch (OR-Tools)
              </Button>
            </div>

            {can("DISPATCH_ROUTE") && activeTab === "consignments" && (
              <Button
                size="small"
                variant="primary"
                onClick={() => setShowCreateForm(!showCreateForm)}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Plus size={14} /> {showCreateForm ? "Close Booking Desk" : "Book New Delivery"}
              </Button>
            )}

            {can("EXPORT_DATA") && filteredCommitments.length > 0 && activeTab === "consignments" && (
              <Button size="small" onClick={handleExportCsv} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Download size={14} /> Export CSV
              </Button>
            )}
          </div>
        }
      />

      {activeTab === "optimizer" ? (
        <DispatchOptimizer />
      ) : (
        <div className="stack" style={{ gap: "1.5rem" }}>
          {/* Collapsible Booking Drawer */}
          {showCreateForm && (
            <div style={{ animation: "fadeIn 0.2s ease-in-out" }}>
              <CreateCommitmentForm />
            </div>
          )}

          {/* Top Operational KPI Cards */}
          <div className="grid cols-5" style={{ gap: "0.75rem" }}>
            <Card>
              <Stat label="Total Deliveries" value={metrics.total} hint="All booked consignments" />
            </Card>
            <Card>
              <Stat label="On-Time Progress" value={metrics.onTime} hint="SLA compliant" />
            </Card>
            <Card>
              <Stat
                label="At Risk"
                value={metrics.atRisk}
                hint={metrics.atRisk > 0 ? "⚠️ Route hazard warning" : "No SLA threats"}
              />
            </Card>
            <Card>
              <Stat
                label="Deadline Missed"
                value={metrics.breached}
                hint={metrics.breached > 0 ? "🔴 Escalation required" : "Zero SLA breaches"}
              />
            </Card>
            <Card>
              <Stat label="Handover Complete" value={metrics.delivered} hint="Delivered to facility" />
            </Card>
          </div>

          {/* Search & Filter Bar */}
          <Card>
            <div className="stack" style={{ gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                {/* Status Tabs */}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <Button
                    size="small"
                    variant={filterMode === "all" ? "primary" : "default"}
                    onClick={() => setFilterMode("all")}
                  >
                    All ({metrics.total})
                  </Button>
                  <Button
                    size="small"
                    variant={filterMode === "unassigned" ? "primary" : "default"}
                    onClick={() => setFilterMode("unassigned")}
                  >
                    Unassigned ({metrics.unassigned})
                  </Button>
                  <Button
                    size="small"
                    variant={filterMode === "transit" ? "primary" : "default"}
                    onClick={() => setFilterMode("transit")}
                  >
                    In Transit ({metrics.inTransit})
                  </Button>
                  <Button
                    size="small"
                    variant={filterMode === "at_risk" ? "primary" : "default"}
                    onClick={() => setFilterMode("at_risk")}
                  >
                    At Risk ({metrics.atRisk})
                  </Button>
                  <Button
                    size="small"
                    variant={filterMode === "partial" ? "primary" : "default"}
                    onClick={() => setFilterMode("partial")}
                  >
                    Partial ({metrics.partial})
                  </Button>
                  <Button
                    size="small"
                    variant={filterMode === "delivered" ? "primary" : "default"}
                    onClick={() => setFilterMode("delivered")}
                  >
                    Delivered ({metrics.delivered})
                  </Button>
                </div>

                {/* Search Input */}
                <div style={{ position: "relative", minWidth: "260px" }}>
                  <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                  <input
                    type="search"
                    placeholder="Search reference, cargo, facility…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: "32px", width: "100%", borderRadius: "6px" }}
                  />
                </div>
              </div>

              {/* Data Table */}
              <QueryState
                query={commitmentsQuery}
                subject="deliveries"
                isEmpty={() => filteredCommitments.length === 0}
                emptyMessage={
                  searchQuery.trim()
                    ? `No deliveries matched the query "${searchQuery}".`
                    : "No deliveries found in this operational view."
                }
              >
                {() => (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Consignment Ref</th>
                          <th scope="col">Cargo & Weight</th>
                          <th scope="col">Priority Tier</th>
                          <th scope="col">Corridor (Origin → Dest)</th>
                          <th scope="col">Assigned Trip</th>
                          <th scope="col">Delivery & SLA</th>
                          <th scope="col">Deadline</th>
                          <th scope="col" style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCommitments.map((c) => {
                          const linked = tripByCommitmentId.get(c.id);
                          return (
                            <tr key={c.id}>
                              <td>
                                <Link
                                  href={`/logistics/deliveries/${c.id}`}
                                  style={{ fontWeight: 700, color: "#38bdf8", textDecoration: "none" }}
                                >
                                  {c.consignment_reference}
                                </Link>
                                <div className="small muted">
                                  {c.delivered_quantity_units} / {c.consigned_quantity_units} units
                                </div>
                              </td>

                              <td>
                                <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                                  <span>{humanize(c.cargo_category)}</span>
                                  {c.is_hazmat && (
                                    <span title="Hazmat cargo" style={{ fontSize: "0.65rem", padding: "1px 4px", borderRadius: "3px", background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", fontWeight: 700 }}>
                                      HAZMAT
                                    </span>
                                  )}
                                  {c.requires_cold_chain && (
                                    <span title="Cold chain required" style={{ fontSize: "0.65rem", padding: "1px 4px", borderRadius: "3px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", fontWeight: 700 }}>
                                      COLD
                                    </span>
                                  )}
                                </div>
                                <div className="small muted">
                                  {c.consigned_weight_kg.toLocaleString()} kg
                                  {c.consigned_volume_m3 ? ` · ${c.consigned_volume_m3.toFixed(1)} m³` : ""}
                                </div>
                              </td>

                              <td>
                                <StatusBadge kind="priority" value={c.priority_tier} />
                              </td>

                              <td>
                                <div style={{ fontSize: "0.85rem" }}>
                                  <strong>{facilityName(c.origin_facility_id)}</strong>
                                  <span style={{ color: "#64748b", margin: "0 0.3rem" }}>→</span>
                                  <strong>{facilityName(c.destination_facility_id)}</strong>
                                </div>
                              </td>

                              <td>
                                {linked ? (
                                  <div className="stack" style={{ gap: "0.2rem" }}>
                                    <Link
                                      href={`/logistics/trips/${linked.tripId}`}
                                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "#38bdf8", fontWeight: 600, fontSize: "0.85rem" }}
                                    >
                                      <Route size={13} /> {linked.tripCode}
                                    </Link>
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                    <span
                                      style={{
                                        fontSize: "0.75rem",
                                        padding: "0.15rem 0.45rem",
                                        borderRadius: "4px",
                                        background: "rgba(245, 158, 11, 0.15)",
                                        color: "#f59e0b",
                                        border: "1px solid rgba(245, 158, 11, 0.3)",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Unassigned
                                    </span>
                                    {can("DISPATCH_ROUTE") && (
                                      <Link
                                        href={`/logistics/assignments?consignmentId=${c.id}`}
                                        className="small"
                                        style={{ color: "#38bdf8", textDecoration: "none" }}
                                      >
                                        Assign
                                      </Link>
                                    )}
                                  </div>
                                )}
                              </td>

                              <td>
                                <div className="stack" style={{ gap: "0.25rem" }}>
                                  <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flexWrap: "wrap" }}>
                                    <StatusBadge kind="delivery" value={c.status} />
                                    <StatusBadge kind="sla" value={c.sla_status} />
                                  </div>
                                  {c.shortage_reason && (
                                    <span className="small muted" style={{ color: "#f87171" }}>
                                      Note: {c.shortage_reason}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td>
                                <div style={{ fontSize: "0.85rem" }}>{formatDateTime(c.required_before)}</div>
                                <div className="small muted">
                                  {new Date(c.required_before).getTime() < Date.now() && c.status !== "DELIVERED" ? (
                                    <span style={{ color: "#f87171", fontWeight: 600 }}>Overdue</span>
                                  ) : (
                                    <span>Target window</span>
                                  )}
                                </div>
                              </td>

                              <td style={{ textAlign: "right" }}>
                                <Link className="btn small" href={`/logistics/deliveries/${c.id}`}>
                                  Dossier
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
      )}
    </div>
  );
}
