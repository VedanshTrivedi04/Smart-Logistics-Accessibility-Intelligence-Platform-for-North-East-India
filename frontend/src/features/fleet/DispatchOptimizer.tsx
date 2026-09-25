"use client";

import { useMemo, useState } from "react";
import {
  Cpu,
  Truck,
  Package,
  Route as RouteIcon,
  CheckCircle2,
  Clock,
  Sparkles,
  RotateCcw,
  CheckSquare,
  Square,
} from "lucide-react";
import { useOptimizeDispatch } from "@/features/ai";
import { useFacilities } from "@/features/network";
import { useCommitments, useVehicles } from "./queries";
import { Button, Card, Banner } from "@/shared/ui";
import { formatDuration } from "@/shared/lib/time";
import { formatKg, humanize, shortId } from "@/shared/lib/format";
import type { Commitment, DispatchRoute, OptimizeDispatchResponse, PriorityTier, Vehicle } from "@/shared/api";

const PRIORITY_BADGE_MAP: Record<PriorityTier, "danger" | "warn" | "neutral"> = {
  TIER_1_LIFE_SAVING: "danger",
  TIER_2_ESSENTIAL: "warn",
  TIER_3_STANDARD: "neutral",
};

export function DispatchOptimizer() {
  const facilitiesQuery = useFacilities();
  const commitmentsQuery = useCommitments();
  const vehiclesQuery = useVehicles();
  const optimizeMutation = useOptimizeDispatch();

  // Selections
  const [selectedDepotId, setSelectedDepotId] = useState<string>("");
  const [selectedCommitmentIds, setSelectedCommitmentIds] = useState<string[]>([]);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<OptimizeDispatchResponse | null>(null);

  const facilities = useMemo(() => facilitiesQuery.data ?? [], [facilitiesQuery.data]);
  const facilityMap = useMemo(() => {
    const map = new Map<string, (typeof facilities)[0]>();
    for (const f of facilities) map.set(f.id, f);
    return map;
  }, [facilities]);

  // Depots: facilities with kind LOGISTICS_HUB, WAREHOUSE, FUEL_DEPOT or fallback
  const depots = useMemo(() => {
    const candidates = facilities.filter(
      (f) => f.kind === "LOGISTICS_HUB" || f.kind === "WAREHOUSE" || f.kind === "FUEL_DEPOT",
    );
    return candidates.length > 0 ? candidates : facilities;
  }, [facilities]);

  // Automatically pick first depot if none chosen
  const activeDepotId = selectedDepotId || (depots[0]?.id ?? "");

  const commitments: Commitment[] = useMemo(() => commitmentsQuery.data ?? [], [commitmentsQuery.data]);
  const pendingCommitments = useMemo(
    () => commitments.filter((c) => c.status === "PENDING" || c.status === "DISPATCHED"),
    [commitments],
  );

  const commitmentMap = useMemo(() => {
    const map = new Map<string, Commitment>();
    for (const c of commitments) map.set(c.id, c);
    return map;
  }, [commitments]);

  const vehicles: Vehicle[] = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);
  const vehicleMap = useMemo(() => {
    const map = new Map<string, Vehicle>();
    for (const v of vehicles) map.set(v.id, v);
    return map;
  }, [vehicles]);

  // Toggle selection helpers
  const toggleCommitment = (id: string) => {
    setSelectedCommitmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllCommitments = () => {
    setSelectedCommitmentIds(pendingCommitments.map((c) => c.id));
  };

  const selectTier1Commitments = () => {
    setSelectedCommitmentIds(
      pendingCommitments
        .filter((c) => c.priority_tier === "TIER_1_LIFE_SAVING")
        .map((c) => c.id),
    );
  };

  const clearCommitments = () => setSelectedCommitmentIds([]);

  const toggleVehicle = (id: string) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllVehicles = () => {
    setSelectedVehicleIds(vehicles.map((v) => v.id));
  };

  const clearVehicles = () => setSelectedVehicleIds([]);

  // Auto-select on initial load if empty
  const handleAutoFill = () => {
    if (pendingCommitments.length > 0) {
      setSelectedCommitmentIds(pendingCommitments.slice(0, 10).map((c) => c.id));
    }
    if (vehicles.length > 0) {
      setSelectedVehicleIds(vehicles.slice(0, 4).map((v) => v.id));
    }
  };

  // Run optimization
  const handleRunOptimization = async () => {
    if (!activeDepotId || selectedCommitmentIds.length === 0 || selectedVehicleIds.length === 0) {
      return;
    }

    try {
      const res = await optimizeMutation.mutateAsync({
        depot_facility_id: activeDepotId,
        commitment_ids: selectedCommitmentIds,
        vehicle_ids: selectedVehicleIds,
      });
      setLastResult(res);
    } catch {
      // Handled by mutation error state
    }
  };

  // Compute selected stats
  const totalSelectedDemandKg = useMemo(() => {
    return selectedCommitmentIds.reduce((sum: number, id: string) => {
      const c = commitmentMap.get(id);
      return sum + (c?.consigned_weight_kg ?? 0);
    }, 0);
  }, [selectedCommitmentIds, commitmentMap]);

  const totalSelectedCapacityKg = useMemo(() => {
    return selectedVehicleIds.reduce((sum: number, id: string) => {
      const v = vehicleMap.get(id);
      return sum + (v?.max_weight_kg ?? 0);
    }, 0);
  }, [selectedVehicleIds, vehicleMap]);

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      {/* Header Banner */}
      <div
        className="card"
        style={{
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))",
          border: "1px solid rgba(148, 163, 184, 0.15)",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
          color: "#f8fafc",
          padding: "1.5rem",
          borderRadius: "12px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span
                style={{
                  display: "inline-flex",
                  padding: "0.4rem",
                  borderRadius: "8px",
                  background: "rgba(99, 102, 241, 0.2)",
                  color: "#818cf8",
                }}
              >
                <Cpu size={22} />
              </span>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "#ffffff" }}>
                AI Multi-Stop Dispatch Optimizer
              </h2>
            </div>
            <p style={{ margin: "0.4rem 0 0", color: "#94a3b8", fontSize: "0.9rem", maxWidth: "680px" }}>
              Solves Capacitated Vehicle Routing Problem (CVRP) with Priority Constraints using Google OR-Tools.
              Optimizes delivery sequences, minimizes total fleet transit duration, and prevents mountain corridor bottlenecks.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              size="small"
              onClick={handleAutoFill}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#e2e8f0",
              }}
            >
              <Sparkles size={14} style={{ marginRight: "0.3rem" }} /> Quick Select (Demo)
            </Button>
            <Button
              variant="primary"
              size="small"
              busy={optimizeMutation.isPending}
              disabled={!activeDepotId || selectedCommitmentIds.length === 0 || selectedVehicleIds.length === 0}
              onClick={handleRunOptimization}
            >
              <RouteIcon size={14} style={{ marginRight: "0.3rem" }} /> Solve Optimal Dispatch
            </Button>
          </div>
        </div>

        {/* Selected Metrics Summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "1rem",
            marginTop: "1.2rem",
            paddingTop: "1.2rem",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
              Starting Depot
            </span>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "#e2e8f0", marginTop: "2px" }}>
              {facilityMap.get(activeDepotId)?.name || "Select depot..."}
            </div>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
              Consignments Chosen
            </span>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "#e2e8f0", marginTop: "2px" }}>
              {selectedCommitmentIds.length} of {pendingCommitments.length}
            </div>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
              Fleet Vehicles
            </span>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "#e2e8f0", marginTop: "2px" }}>
              {selectedVehicleIds.length} of {vehicles.length}
            </div>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
              Capacity Utilization
            </span>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", color: totalSelectedDemandKg > totalSelectedCapacityKg ? "#f87171" : "#34d399", marginTop: "2px" }}>
              {formatKg(totalSelectedDemandKg)} / {formatKg(totalSelectedCapacityKg)}
            </div>
          </div>
        </div>
      </div>

      {optimizeMutation.isError ? (
        <Banner tone="danger" title="Optimization Solver Error">
          {optimizeMutation.error.message || "Failed to compute optimal multi-stop routes. Verify facility accessibility and vehicle capacity."}
        </Banner>
      ) : null}

      {/* Solver Results Section */}
      {lastResult ? (
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <CheckCircle2 size={20} color="#10b981" />
              <span>OR-Tools Optimization Results ({lastResult.routes.length} Active Routes)</span>
            </div>
          }
          actions={
            <Button size="small" onClick={() => setLastResult(null)}>
              <RotateCcw size={14} style={{ marginRight: "0.3rem" }} /> Reset View
            </Button>
          }
        >
          <div className="stack" style={{ gap: "1rem" }}>
            {lastResult.unassigned_commitment_ids.length > 0 ? (
              <Banner tone="warn" title={`${lastResult.unassigned_commitment_ids.length} Consignments Unassigned`}>
                Some packages could not be assigned to this dispatch batch because fleet capacity was reached or delivery time windows conflicted.
              </Banner>
            ) : null}

            {/* Routes List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {lastResult.routes.map((route: DispatchRoute, routeIdx: number) => {
                const vehicle = vehicleMap.get(route.vehicle_id);
                const routeCommitments = route.commitment_ids
                  .map((id: string) => commitmentMap.get(id))
                  .filter((c): c is Commitment => c !== undefined);

                const totalWeightKg = routeCommitments.reduce((sum: number, c: Commitment) => sum + c.consigned_weight_kg, 0);
                const capacityKg = vehicle?.max_weight_kg ?? 1;
                const loadPercent = Math.min(100, Math.round((totalWeightKg / capacityKg) * 100));

                return (
                  <div
                    key={route.vehicle_id}
                    style={{
                      border: "1px solid var(--border-color, #e2e8f0)",
                      borderRadius: "10px",
                      padding: "1.2rem",
                      background: "var(--card-bg, #ffffff)",
                    }}
                  >
                    {/* Route Vehicle Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.8rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "0.35rem 0.6rem",
                            borderRadius: "6px",
                            background: "#3b82f6",
                            color: "#ffffff",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                          }}
                        >
                          Route #{routeIdx + 1}
                        </span>
                        <div>
                          <strong>{vehicle?.registration_number ?? shortId(route.vehicle_id)}</strong>
                          <span className="muted small" style={{ marginLeft: "0.5rem" }}>
                            {humanize(vehicle?.vehicle_type)}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "1rem", fontSize: "0.85rem" }}>
                        <span>
                          <Clock size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "3px" }} />
                          {formatDuration(route.total_duration_seconds)}
                        </span>
                        <span>
                          <RouteIcon size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "3px" }} />
                          {(route.total_distance_meters / 1000).toFixed(1)} km
                        </span>
                      </div>
                    </div>

                    {/* Capacity Progress Bar */}
                    <div style={{ marginBottom: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "3px" }}>
                        <span className="muted">Cargo Payload</span>
                        <span>
                          <strong>{formatKg(totalWeightKg)}</strong> / {formatKg(capacityKg)} ({loadPercent}%)
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${loadPercent}%`,
                            height: "100%",
                            background: loadPercent > 90 ? "#ef4444" : loadPercent > 70 ? "#f59e0b" : "#10b981",
                            borderRadius: "4px",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    </div>

                    {/* Step-by-step stops timeline */}
                    <div style={{ borderTop: "1px dashed var(--border-color, #e2e8f0)", paddingTop: "0.8rem" }}>
                      <span className="small muted" style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                        OPTIMAL DELIVERY ITINERARY:
                      </span>
                      <ol style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        <li style={{ fontSize: "0.85rem" }}>
                          <strong>Depot Departure:</strong> {facilityMap.get(activeDepotId)?.name || "Origin Depot"}
                        </li>
                        {routeCommitments.map((comm: Commitment, idx: number) => {
                          const destFacility = facilityMap.get(comm.destination_facility_id);
                          return (
                            <li key={comm.id} style={{ fontSize: "0.85rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                                <span>
                                  <strong>Stop {idx + 1}:</strong> {destFacility?.name || comm.destination_facility_id}
                                </span>
                                <span className={`badge ${PRIORITY_BADGE_MAP[comm.priority_tier]}`} style={{ fontSize: "0.7rem", padding: "1px 6px" }}>
                                  {humanize(comm.priority_tier)}
                                </span>
                                <span className="small muted">
                                  ({comm.consignment_reference} &bull; {formatKg(comm.consigned_weight_kg)})
                                </span>
                              </div>
                            </li>
                          );
                        })}
                        <li style={{ fontSize: "0.85rem", color: "#64748b" }}>
                          <strong>Depot Return:</strong> {facilityMap.get(activeDepotId)?.name || "Origin Depot"} (Vehicle Rest & Recharging)
                        </li>
                      </ol>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ) : null}

      {/* Configuration & Selection Panel */}
      <div className="grid cols-2" style={{ gap: "1.2rem" }}>
        {/* Step 1: Depot & Consignments */}
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Package size={18} />
              <span>1. Depot & Consignments ({selectedCommitmentIds.length} Selected)</span>
            </div>
          }
          actions={
            <div style={{ display: "flex", gap: "0.3rem" }}>
              <Button size="small" onClick={selectAllCommitments}>
                All
              </Button>
              <Button size="small" onClick={selectTier1Commitments}>
                Tier 1
              </Button>
              <Button size="small" onClick={clearCommitments}>
                Clear
              </Button>
            </div>
          }
        >
          <div className="stack" style={{ gap: "1rem" }}>
            {/* Depot Selector */}
            <div className="field">
              <label htmlFor="dispatch-depot">Origin Depot Hub</label>
              <select
                id="dispatch-depot"
                value={activeDepotId}
                onChange={(e) => setSelectedDepotId(e.target.value)}
              >
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({humanize(d.kind)})
                  </option>
                ))}
              </select>
            </div>

            {/* Consignments List */}
            <div style={{ maxHeight: "380px", overflowY: "auto", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "8px" }}>
              {pendingCommitments.length === 0 ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--muted-color, #64748b)" }}>
                  No pending consignments found.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color, #e2e8f0)", background: "rgba(0,0,0,0.02)" }}>
                      <th style={{ width: "35px", padding: "0.5rem" }} />
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Reference / Destination</th>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Priority</th>
                      <th style={{ textAlign: "right", padding: "0.5rem" }}>Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingCommitments.map((c) => {
                      const isSelected = selectedCommitmentIds.includes(c.id);
                      const dest = facilityMap.get(c.destination_facility_id);
                      return (
                        <tr
                          key={c.id}
                          onClick={() => toggleCommitment(c.id)}
                          style={{
                            cursor: "pointer",
                            background: isSelected ? "rgba(99, 102, 241, 0.08)" : "transparent",
                            borderBottom: "1px solid var(--border-color, #e2e8f0)",
                          }}
                        >
                          <td style={{ padding: "0.5rem", textAlign: "center" }}>
                            {isSelected ? (
                              <CheckSquare size={16} color="#6366f1" />
                            ) : (
                              <Square size={16} color="#94a3b8" />
                            )}
                          </td>
                          <td style={{ padding: "0.5rem" }}>
                            <strong>{c.consignment_reference}</strong>
                            <div className="small muted">{dest?.name || shortId(c.destination_facility_id)}</div>
                          </td>
                          <td style={{ padding: "0.5rem" }}>
                            <span className={`badge ${PRIORITY_BADGE_MAP[c.priority_tier]}`} style={{ fontSize: "0.7rem", padding: "2px 6px" }}>
                              {humanize(c.priority_tier)}
                            </span>
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "right" }}>
                            {formatKg(c.consigned_weight_kg)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </Card>

        {/* Step 2: Available Fleet Vehicles */}
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Truck size={18} />
              <span>2. Fleet Vehicles ({selectedVehicleIds.length} Selected)</span>
            </div>
          }
          actions={
            <div style={{ display: "flex", gap: "0.3rem" }}>
              <Button size="small" onClick={selectAllVehicles}>
                All
              </Button>
              <Button size="small" onClick={clearVehicles}>
                Clear
              </Button>
            </div>
          }
        >
          <div className="stack" style={{ gap: "1rem" }}>
            <p className="small muted" style={{ margin: 0 }}>
              Select fleet vehicles available for dispatch assignment from this hub.
            </p>

            <div style={{ maxHeight: "430px", overflowY: "auto", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "8px" }}>
              {vehicles.length === 0 ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--muted-color, #64748b)" }}>
                  No available vehicles found.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color, #e2e8f0)", background: "rgba(0,0,0,0.02)" }}>
                      <th style={{ width: "35px", padding: "0.5rem" }} />
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Vehicle / Type</th>
                      <th style={{ textAlign: "right", padding: "0.5rem" }}>Max Capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v) => {
                      const isSelected = selectedVehicleIds.includes(v.id);
                      return (
                        <tr
                          key={v.id}
                          onClick={() => toggleVehicle(v.id)}
                          style={{
                            cursor: "pointer",
                            background: isSelected ? "rgba(99, 102, 241, 0.08)" : "transparent",
                            borderBottom: "1px solid var(--border-color, #e2e8f0)",
                          }}
                        >
                          <td style={{ padding: "0.5rem", textAlign: "center" }}>
                            {isSelected ? (
                              <CheckSquare size={16} color="#6366f1" />
                            ) : (
                              <Square size={16} color="#94a3b8" />
                            )}
                          </td>
                          <td style={{ padding: "0.5rem" }}>
                            <strong>{v.registration_number}</strong>
                            <div className="small muted">{humanize(v.vehicle_type)} &bull; {v.make_model}</div>
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "right" }}>
                            <strong>{formatKg(v.max_weight_kg)}</strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
