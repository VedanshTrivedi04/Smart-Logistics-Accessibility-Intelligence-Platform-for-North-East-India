"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Layers,
  Package,
  Truck,
  UserCheck,
  Calendar,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  Cpu,
  Clock,
  MapPin,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { useSession } from "@/shared/auth";
import { useFacilities } from "@/features/network";
import { useCommitments, useVehicles, useDrivers, useTrips, useDispatchTrip } from "./queries";
import { CreateCommitmentForm, DispatchTripForm } from "./forms";
import { DispatchOptimizer } from "./DispatchOptimizer";
import { PageHeader, Button, Card, Banner } from "@/shared/ui";
import { formatKg, humanize, shortId } from "@/shared/lib/format";
import type { Commitment, PriorityTier, Vehicle, Driver } from "@/shared/api";

const PRIORITY_BADGE_MAP: Record<PriorityTier, "danger" | "warn" | "neutral"> = {
  TIER_1_LIFE_SAVING: "danger",
  TIER_2_ESSENTIAL: "warn",
  TIER_3_STANDARD: "neutral",
};

export function AssignmentsView() {
  const { can } = useSession();
  const [activeTab, setActiveTab] = useState<"wizard" | "intake" | "manual" | "optimizer">("wizard");

  const commitmentsQuery = useCommitments();
  const pendingCount = useMemo(() => {
    return (commitmentsQuery.data ?? []).filter((c) => c.status === "PENDING").length;
  }, [commitmentsQuery.data]);

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <PageHeader
        title="Fleet Assignments & Dispatch"
        subtitle="Match pending consignments to vehicles and drivers, launch verified trips, or run optimization-based dispatch (Google OR-Tools)."
        actions={
          <div style={{ display: "flex", gap: "0.4rem", background: "rgba(0, 0, 0, 0.05)", padding: "3px", borderRadius: "8px", flexWrap: "wrap" }}>
            <Button
              size="small"
              variant={activeTab === "wizard" ? "primary" : "default"}
              onClick={() => setActiveTab("wizard")}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Layers size={14} /> Guided Assignment
              {pendingCount > 0 ? (
                <span style={{ background: "#ef4444", color: "#fff", padding: "1px 6px", borderRadius: "10px", fontSize: "0.7rem", fontWeight: 700 }}>
                  {pendingCount}
                </span>
              ) : null}
            </Button>
            <Button
              size="small"
              variant={activeTab === "intake" ? "primary" : "default"}
              onClick={() => setActiveTab("intake")}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <PlusCircle size={14} /> Consignment Intake
            </Button>
            <Button
              size="small"
              variant={activeTab === "manual" ? "primary" : "default"}
              onClick={() => setActiveTab("manual")}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <MapPin size={14} /> Multi-Stop Planner
            </Button>
            <Button
              size="small"
              variant={activeTab === "optimizer" ? "primary" : "default"}
              onClick={() => setActiveTab("optimizer")}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Cpu size={14} /> Optimization Solver (OR-Tools)
            </Button>
          </div>
        }
      />

      {activeTab === "wizard" && <AssignmentWizard />}
      {activeTab === "intake" && (
        <div className="stack" style={{ gap: "1rem" }}>
          {can("DISPATCH_ROUTE") ? (
            <CreateCommitmentForm />
          ) : (
            <Banner tone="warn" title="Permission Required">
              You need the <code>DISPATCH_ROUTE</code> capability to record new delivery consignments.
            </Banner>
          )}
        </div>
      )}
      {activeTab === "manual" && (
        <div className="stack" style={{ gap: "1rem" }}>
          {can("DISPATCH_ROUTE") ? (
            <DispatchTripForm />
          ) : (
            <Banner tone="warn" title="Permission Required">
              You need the <code>DISPATCH_ROUTE</code> capability to configure custom multi-stop routes.
            </Banner>
          )}
        </div>
      )}
      {activeTab === "optimizer" && <DispatchOptimizer />}
    </div>
  );
}

function AssignmentWizard() {
  const { can } = useSession();
  const commitmentsQuery = useCommitments();
  const vehiclesQuery = useVehicles();
  const driversQuery = useDrivers();
  const tripsQuery = useTrips();
  const facilitiesQuery = useFacilities();
  const dispatchTrip = useDispatchTrip();

  // Wizard step: 1 = pick commitment, 2 = pick vehicle & driver, 3 = timing & dispatch
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCommitmentId, setSelectedCommitmentId] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [tripCode, setTripCode] = useState<string>("");
  const [departureTime, setDepartureTime] = useState<string>(() => {
    const d = new Date(Date.now() + 15 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [arrivalTime, setArrivalTime] = useState<string>(() => {
    const d = new Date(Date.now() + 135 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const facilities = useMemo(() => facilitiesQuery.data ?? [], [facilitiesQuery.data]);
  const facilityMap = useMemo(() => {
    const m = new Map<string, (typeof facilities)[0]>();
    for (const f of facilities) m.set(f.id, f);
    return m;
  }, [facilities]);

  const commitments = useMemo(() => commitmentsQuery.data ?? [], [commitmentsQuery.data]);
  const pendingCommitments = useMemo(() => {
    return commitments.filter((c) => c.status === "PENDING");
  }, [commitments]);

  const selectedCommitment = useMemo(() => {
    return commitments.find((c) => c.id === selectedCommitmentId) ?? null;
  }, [commitments, selectedCommitmentId]);

  const activeTrips = useMemo(() => {
    return (tripsQuery.data ?? []).filter((t) =>
      ["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION"].includes(t.status),
    );
  }, [tripsQuery.data]);

  const busyVehicleIds = useMemo(() => new Set(activeTrips.map((t) => t.vehicle_id)), [activeTrips]);
  const busyDriverIds = useMemo(() => new Set(activeTrips.map((t) => t.driver_id)), [activeTrips]);

  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);
  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);

  const selectedVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === selectedVehicleId) ?? null;
  }, [vehicles, selectedVehicleId]);

  const selectedDriver = useMemo(() => {
    return drivers.find((d) => d.id === selectedDriverId) ?? null;
  }, [drivers, selectedDriverId]);

  const handleSelectCommitment = (c: Commitment) => {
    setSelectedCommitmentId(c.id);
    setTripCode(`TR-${c.consignment_reference}-${Date.now().toString().slice(-4)}`);
    setStep(2);
  };

  const handleReset = () => {
    setSelectedCommitmentId("");
    setSelectedVehicleId("");
    setSelectedDriverId("");
    setTripCode("");
    setErrorMsg(null);
    setStep(1);
  };

  const handleDispatch = async () => {
    setErrorMsg(null);
    if (!selectedCommitment) return setErrorMsg("No consignment selected.");
    if (!selectedVehicleId) return setErrorMsg("Please select an assigned vehicle.");
    if (!selectedDriverId) return setErrorMsg("Please select an assigned driver.");
    if (!tripCode.trim()) return setErrorMsg("Trip identifier is required.");

    const origin = facilityMap.get(selectedCommitment.origin_facility_id);
    const dest = facilityMap.get(selectedCommitment.destination_facility_id);

    if (!origin || !dest) {
      return setErrorMsg("Origin or destination facility coordinates could not be resolved from network registry.");
    }

    const depDate = new Date(departureTime);
    const arrDate = new Date(arrivalTime);

    if (isNaN(depDate.getTime()) || isNaN(arrDate.getTime())) {
      return setErrorMsg("Departure and arrival timestamps must be valid dates.");
    }

    if (arrDate <= depDate) {
      return setErrorMsg("Planned arrival must be after scheduled departure.");
    }

    const stops = [
      {
        stop_type: "PICKUP" as const,
        facility_id: origin.id,
        lat: origin.lat,
        lon: origin.lon,
        planned_arrival: depDate.toISOString(),
        planned_departure: depDate.toISOString(),
      },
      {
        stop_type: "DELIVERY" as const,
        facility_id: dest.id,
        lat: dest.lat,
        lon: dest.lon,
        planned_arrival: arrDate.toISOString(),
        planned_departure: arrDate.toISOString(),
      },
    ];

    try {
      await dispatchTrip.mutateAsync({
        vehicle_id: selectedVehicleId,
        driver_id: selectedDriverId,
        trip_code: tripCode.trim(),
        scheduled_departure: depDate.toISOString(),
        commitment_ids: [selectedCommitment.id],
        stops,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to dispatch trip. Please verify vehicle and driver availability.");
    }
  };

  if (!can("DISPATCH_ROUTE")) {
    return (
      <Banner tone="warn" title="Dispatch Route Capability Required">
        You do not hold the <code>DISPATCH_ROUTE</code> capability. Only authorized Fleet Managers and Delivery Coordinators can schedule and dispatch trips.
      </Banner>
    );
  }

  if (dispatchTrip.isSuccess) {
    const trip = dispatchTrip.data;
    return (
      <Card title="Trip Dispatched Successfully">
        <div className="stack" style={{ gap: "1rem", padding: "0.5rem 0" }}>
          <Banner tone="ok" title={`Trip ${trip.trip_code} is now scheduled`}>
            Consignment <strong>{selectedCommitment?.consignment_reference}</strong> has been allocated to vehicle{" "}
            <strong>{selectedVehicle?.registration_number}</strong> and driver <strong>{selectedDriver?.full_name}</strong>.
          </Banner>
          <div style={{ display: "flex", gap: "0.8rem", marginTop: "0.5rem" }}>
            <Link href={`/logistics/trips/${trip.id}`}>
              <Button variant="primary">
                Inspect Trip Monitor <ExternalLink size={14} style={{ marginLeft: "4px" }} />
              </Button>
            </Link>
            <Button variant="default" onClick={handleReset}>
              <RotateCcw size={14} style={{ marginRight: "4px" }} /> Assign Another Consignment
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      {/* Wizard Progress Stepper */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e2e8f0)",
          borderRadius: "8px",
          padding: "0.8rem 1.2rem",
          overflowX: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: step === 1 ? "#3b82f6" : "#10b981", fontWeight: 600 }}>
          <span
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: step === 1 ? "#3b82f6" : "#10b981",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8rem",
            }}
          >
            1
          </span>
          <span>1. Select Consignment</span>
        </div>
        <ArrowRight size={16} color="#94a3b8" />
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: step === 2 ? "#3b82f6" : step > 2 ? "#10b981" : "#94a3b8", fontWeight: 600 }}>
          <span
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: step === 2 ? "#3b82f6" : step > 2 ? "#10b981" : "#cbd5e1",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8rem",
            }}
          >
            2
          </span>
          <span>2. Vehicle & Driver</span>
        </div>
        <ArrowRight size={16} color="#94a3b8" />
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: step === 3 ? "#3b82f6" : "#94a3b8", fontWeight: 600 }}>
          <span
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: step === 3 ? "#3b82f6" : "#cbd5e1",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8rem",
            }}
          >
            3
          </span>
          <span>3. Schedule & Dispatch</span>
        </div>
      </div>

      {/* Step 1: Pick Consignment */}
      {step === 1 && (
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Package size={18} />
              <span>Pending Delivery Consignments ({pendingCommitments.length})</span>
            </div>
          }
        >
          {commitmentsQuery.isPending ? (
            <p className="muted">Loading pending consignments…</p>
          ) : pendingCommitments.length === 0 ? (
            <div style={{ padding: "2rem 0", textAlign: "center" }} className="muted">
              <CheckCircle2 size={32} color="#10b981" style={{ margin: "0 auto 0.5rem auto" }} />
              <p>All consignments are currently assigned to active trips!</p>
              <p className="small">Use the Consignment Intake tab to record new delivery orders.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Priority</th>
                    <th>Origin &rarr; Destination</th>
                    <th>Payload Weight</th>
                    <th>Deadline</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCommitments.map((c) => {
                    const orig = facilityMap.get(c.origin_facility_id)?.name ?? c.origin_facility_id;
                    const dest = facilityMap.get(c.destination_facility_id)?.name ?? c.destination_facility_id;
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.consignment_reference}</strong>
                          <div className="small muted">{humanize(c.cargo_category)}</div>
                        </td>
                        <td>
                          <span className={`badge ${PRIORITY_BADGE_MAP[c.priority_tier]}`}>
                            {humanize(c.priority_tier)}
                          </span>
                        </td>
                        <td>
                          {orig} &rarr; <strong>{dest}</strong>
                        </td>
                        <td>
                          <strong>{formatKg(c.consigned_weight_kg)}</strong>
                          <div className="small muted">{c.consigned_quantity_units} units</div>
                        </td>
                        <td>
                          <span className="small">
                            {new Date(c.required_before).toLocaleDateString()}{" "}
                            {new Date(c.required_before).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td>
                          <Button size="small" variant="primary" onClick={() => handleSelectCommitment(c)}>
                            Assign <ArrowRight size={14} style={{ marginLeft: "4px" }} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Step 2: Choose Vehicle & Driver */}
      {step === 2 && selectedCommitment && (
        <div className="stack" style={{ gap: "1.2rem" }}>
          {/* Selected Consignment Summary */}
          <div
            style={{
              padding: "1rem",
              background: "rgba(59, 130, 246, 0.05)",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.8rem",
            }}
          >
            <div>
              <span className="small muted">Selected Consignment:</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <strong>{selectedCommitment.consignment_reference}</strong>
                <span className={`badge ${PRIORITY_BADGE_MAP[selectedCommitment.priority_tier]}`}>
                  {humanize(selectedCommitment.priority_tier)}
                </span>
                <span>&bull; Weight: <strong>{formatKg(selectedCommitment.consigned_weight_kg)}</strong></span>
              </div>
              <div className="small muted">
                {facilityMap.get(selectedCommitment.origin_facility_id)?.name ?? selectedCommitment.origin_facility_id} &rarr;{" "}
                {facilityMap.get(selectedCommitment.destination_facility_id)?.name ?? selectedCommitment.destination_facility_id}
              </div>
            </div>
            <Button size="small" variant="default" onClick={() => setStep(1)}>
              Change Consignment
            </Button>
          </div>

          <div className="grid cols-2" style={{ gap: "1.2rem" }}>
            {/* Vehicle Selection */}
            <Card
              title={
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Truck size={18} />
                  <span>Compatible Vehicles</span>
                </div>
              }
            >
              <div className="stack" style={{ gap: "0.6rem" }}>
                {vehicles.length === 0 ? (
                  <p className="muted small">No vehicles registered.</p>
                ) : (
                  vehicles.map((v) => {
                    const isBusy = busyVehicleIds.has(v.id);
                    const isWeightCompatible = v.max_weight_kg >= selectedCommitment.consigned_weight_kg;
                    const isHazmatCompatible = !selectedCommitment.is_hazmat || v.is_hazmat_capable;
                    const isColdChainCompatible = !selectedCommitment.requires_cold_chain || v.is_refrigerated;
                    const isCompatible = isWeightCompatible && isHazmatCompatible && isColdChainCompatible;
                    const isSelected = selectedVehicleId === v.id;

                    let incompatibilityReason = "";
                    if (!isWeightCompatible) incompatibilityReason = "Under Capacity";
                    else if (!isHazmatCompatible) incompatibilityReason = "No Hazmat Certification";
                    else if (!isColdChainCompatible) incompatibilityReason = "No Cold-Chain/Refrigeration";

                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          if (!isBusy && isCompatible) setSelectedVehicleId(v.id);
                        }}
                        style={{
                          border: isSelected ? "2px solid #3b82f6" : "1px solid var(--border-color, #e2e8f0)",
                          borderRadius: "8px",
                          padding: "0.8rem",
                          cursor: isBusy || !isCompatible ? "not-allowed" : "pointer",
                          opacity: isBusy || !isCompatible ? 0.5 : 1,
                          background: isSelected ? "rgba(59, 130, 246, 0.05)" : "var(--card-bg, #fff)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <strong>{v.registration_number}</strong>
                            <span className="small muted" style={{ marginLeft: "0.5rem" }}>
                              {humanize(v.vehicle_type)} &bull; {v.make_model}
                            </span>
                          </div>
                          {isBusy ? (
                            <span className="badge neutral">On Active Trip</span>
                          ) : !isCompatible ? (
                            <span className="badge danger">{incompatibilityReason}</span>
                          ) : (
                            <span className="badge ok">Ready</span>
                          )}
                        </div>
                        <div className="small muted" style={{ marginTop: "0.3rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span>Payload Cap: <strong>{formatKg(v.max_weight_kg)}</strong> (Needs {formatKg(selectedCommitment.consigned_weight_kg)})</span>
                          {v.is_hazmat_capable && <span style={{ color: "#f59e0b" }}>⚠️ Hazmat-ready</span>}
                          {v.is_refrigerated && <span style={{ color: "#38bdf8" }}>❄️ Refrig.</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Driver Selection */}
            <Card
              title={
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <UserCheck size={18} />
                  <span>Available Drivers</span>
                </div>
              }
            >
              <div className="stack" style={{ gap: "0.6rem" }}>
                {drivers.length === 0 ? (
                  <p className="muted small">No drivers registered.</p>
                ) : (
                  drivers.map((d) => {
                    const isBusy = busyDriverIds.has(d.id);
                    const isSelected = selectedDriverId === d.id;

                    return (
                      <div
                        key={d.id}
                        onClick={() => {
                          if (!isBusy && d.is_active) setSelectedDriverId(d.id);
                        }}
                        style={{
                          border: isSelected ? "2px solid #3b82f6" : "1px solid var(--border-color, #e2e8f0)",
                          borderRadius: "8px",
                          padding: "0.8rem",
                          cursor: isBusy || !d.is_active ? "not-allowed" : "pointer",
                          opacity: isBusy || !d.is_active ? 0.5 : 1,
                          background: isSelected ? "rgba(59, 130, 246, 0.05)" : "var(--card-bg, #fff)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <strong>{d.full_name}</strong>
                            <span className="small muted" style={{ marginLeft: "0.5rem" }}>
                              Licence: {d.license_number}
                            </span>
                          </div>
                          {isBusy ? (
                            <span className="badge neutral">On Active Trip</span>
                          ) : !d.is_active ? (
                            <span className="badge danger">Inactive</span>
                          ) : (
                            <span className="badge ok">Available</span>
                          )}
                        </div>
                        <div className="small muted" style={{ marginTop: "0.3rem" }}>
                          Classes: {d.license_classes.join(", ")}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
            <Button variant="default" onClick={() => setStep(1)}>
              &larr; Back
            </Button>
            <Button
              variant="primary"
              disabled={!selectedVehicleId || !selectedDriverId}
              onClick={() => setStep(3)}
            >
              Continue to Schedule &rarr;
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Schedule & Launch */}
      {step === 3 && selectedCommitment && selectedVehicle && selectedDriver && (
        <Card title="Step 3: Schedule & Launch Trip">
          <div className="stack" style={{ gap: "1.2rem" }}>
            <div className="grid cols-3" style={{ gap: "1rem" }}>
              <div style={{ padding: "0.8rem", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "8px" }}>
                <span className="small muted">Consignment</span>
                <div style={{ fontWeight: 600 }}>{selectedCommitment.consignment_reference}</div>
                <div className="small muted">{formatKg(selectedCommitment.consigned_weight_kg)}</div>
              </div>
              <div style={{ padding: "0.8rem", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "8px" }}>
                <span className="small muted">Assigned Vehicle</span>
                <div style={{ fontWeight: 600 }}>{selectedVehicle.registration_number}</div>
                <div className="small muted">{humanize(selectedVehicle.vehicle_type)}</div>
              </div>
              <div style={{ padding: "0.8rem", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "8px" }}>
                <span className="small muted">Assigned Driver</span>
                <div style={{ fontWeight: 600 }}>{selectedDriver.full_name}</div>
                <div className="small muted">{selectedDriver.license_number}</div>
              </div>
            </div>

            <div className="grid cols-3" style={{ gap: "1rem" }}>
              <div className="field">
                <label htmlFor="w-code">Trip Identifier Code *</label>
                <input
                  id="w-code"
                  value={tripCode}
                  onChange={(e) => setTripCode(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="w-dep">Scheduled Departure *</label>
                <input
                  id="w-dep"
                  type="datetime-local"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="w-arr">Planned Arrival *</label>
                <input
                  id="w-arr"
                  type="datetime-local"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                />
              </div>
            </div>

            <div style={{ borderTop: "1px dashed var(--border-color, #e2e8f0)", paddingTop: "0.8rem" }}>
              <span className="small muted" style={{ display: "block", marginBottom: "0.4rem", fontWeight: 600 }}>
                TRIP STOPS ITINERARY:
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.85rem" }}>
                  <span className="badge ok">1. PICKUP</span>
                  <strong>{facilityMap.get(selectedCommitment.origin_facility_id)?.name ?? selectedCommitment.origin_facility_id}</strong>
                  <span className="muted">(Departure: {new Date(departureTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.85rem" }}>
                  <span className="badge danger">2. DELIVERY</span>
                  <strong>{facilityMap.get(selectedCommitment.destination_facility_id)?.name ?? selectedCommitment.destination_facility_id}</strong>
                  <span className="muted">(Expected Arrival: {new Date(arrivalTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})</span>
                </div>
              </div>
            </div>

            {errorMsg ? (
              <div style={{ color: "#ef4444", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <AlertTriangle size={16} />
                <span>{errorMsg}</span>
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <Button variant="default" onClick={() => setStep(2)}>
                &larr; Back
              </Button>
              <Button
                variant="primary"
                busy={dispatchTrip.isPending}
                onClick={handleDispatch}
              >
                Confirm & Dispatch Trip
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
