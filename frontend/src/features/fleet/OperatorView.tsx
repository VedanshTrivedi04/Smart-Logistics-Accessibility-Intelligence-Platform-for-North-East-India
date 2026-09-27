"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type TripStatus } from "@/shared/api";
import { usePrincipal } from "@/shared/auth";
import { formatCoords, humanize } from "@/shared/lib/format";
import { formatDateTime } from "@/shared/lib/time";
import { Banner, Button, Card, KeyValue, StatusBadge, useAnnounce } from "@/shared/ui";
import { useGeolocation } from "@/features/field/useGeolocation";
import {
  useCommitments,
  useTripImpacts,
  useTripTransition,
  useTrips,
  useUpdateCommitmentStatus,
  useVehicles,
} from "./queries";

export function OperatorCockpit() {
  const me = usePrincipal();
  const announce = useAnnounce();
  const geo = useGeolocation(true);
  const vehicles = useVehicles();
  const trips = useTrips();
  const commitments = useCommitments();
  const transition = useTripTransition();
  const updateCommitmentStatus = useUpdateCommitmentStatus();

  // Find active or dispatched trips
  const activeTrips = useMemo(() => {
    return (trips.data ?? []).filter(
      (t) => t.status === "IN_TRANSIT" || t.status === "DISPATCHED" || t.status === "HELD_FOR_INSPECTION" || t.status === "DIVERTED"
    );
  }, [trips.data]);

  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // Default to first active trip or first trip
  const activeTrip = useMemo(() => {
    if (selectedTripId) {
      return (trips.data ?? []).find((t) => t.id === selectedTripId) ?? null;
    }
    return activeTrips[0] ?? (trips.data ?? [])[0] ?? null;
  }, [selectedTripId, activeTrips, trips.data]);

  const assignedVehicle = useMemo(() => {
    if (!activeTrip) return null;
    return vehicles.data?.find((v) => v.id === activeTrip.vehicle_id) ?? null;
  }, [activeTrip, vehicles.data]);

  const linkedCommitments = useMemo(() => {
    if (!activeTrip) return [];
    return (commitments.data ?? []).filter((c) => activeTrip.commitment_ids.includes(c.id));
  }, [activeTrip, commitments.data]);

  const tripImpacts = useTripImpacts(activeTrip?.id ?? null);

  const [confirmComplete, setConfirmComplete] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  // Dedicated Driver POD Handover State
  const [podCommitment, setPodCommitment] = useState<any | null>(null);
  const [podResult, setPodResult] = useState<"full" | "partial" | "failed">("full");
  const [podDeliveredUnits, setPodDeliveredUnits] = useState("");
  const [podShortageReason, setPodShortageReason] = useState("");
  const [podRecipientName, setPodRecipientName] = useState("");
  const [podRecipientOrg, setPodRecipientOrg] = useState("");
  const [podCondition, setPodCondition] = useState("GOOD");

  const handleOpenPod = (c: any) => {
    setPodCommitment(c);
    setPodResult(c.status === "PARTIALLY_DELIVERED" ? "partial" : "full");
    setPodDeliveredUnits(String(c.delivered_quantity_units > 0 ? c.delivered_quantity_units : c.consigned_quantity_units));
    setPodShortageReason(c.shortage_reason ?? "");
    setPodRecipientName(c.recipient_name ?? "");
    setPodRecipientOrg(c.recipient_organization ?? "");
    setPodCondition(c.delivery_condition ?? "GOOD");
  };

  const handleSelectPodResult = (res: "full" | "partial" | "failed") => {
    if (!podCommitment) return;
    setPodResult(res);
    if (res === "full") {
      setPodDeliveredUnits(String(podCommitment.consigned_quantity_units));
      setPodCondition("GOOD");
    } else if (res === "partial") {
      const half = Math.max(1, Math.floor(podCommitment.consigned_quantity_units * 0.8));
      setPodDeliveredUnits(String(half));
      setPodCondition("PARTIAL_LOSS");
    } else if (res === "failed") {
      setPodDeliveredUnits("0");
      setPodCondition("REJECTED_BY_RECIPIENT");
    }
  };

  const handleSubmitPod = () => {
    if (!podCommitment) return;
    const units = parseInt(podDeliveredUnits, 10);
    const targetStatus = podResult === "full" ? "DELIVERED" : podResult === "partial" ? "PARTIALLY_DELIVERED" : "FAILED";
    const gpsLocation = geo.state.status === "ok" ? formatCoords(geo.state.fix.latitude, geo.state.fix.longitude) : undefined;
    const notes = [
      podShortageReason.trim(),
      gpsLocation ? `GPS: ${gpsLocation}` : null,
    ].filter(Boolean).join(" | ");

    updateCommitmentStatus.mutate(
      {
        commitmentId: podCommitment.id,
        status: targetStatus,
        deliveredUnits: isNaN(units) ? undefined : units,
        shortageReason: notes || undefined,
        recipientName: podRecipientName.trim() || undefined,
        recipientOrganization: podRecipientOrg.trim() || undefined,
        deliveryCondition: podCondition,
      },
      {
        onSuccess: () => {
          announce(`Proof of Handover recorded for ${podCommitment.consignment_reference}`);
          setPodCommitment(null);
        },
      }
    );
  };

  const unconfirmedCommitments = useMemo(() => {
    return linkedCommitments.filter((c) => c.status !== "DELIVERED" && c.status !== "PARTIALLY_DELIVERED" && c.status !== "FAILED");
  }, [linkedCommitments]);

  const handleCopyCoords = () => {
    if (geo.state.status === "ok") {
      const text = `${geo.state.fix.latitude.toFixed(6)}, ${geo.state.fix.longitude.toFixed(6)}`;
      void navigator.clipboard?.writeText(text);
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 3000);
      announce("GPS Coordinates copied to clipboard");
    }
  };

  const executeTransition = (target: TripStatus) => {
    if (!activeTrip) return;
    transition.mutate(
      { tripId: activeTrip.id, target },
      {
        onSuccess: () => {
          announce(`Trip status updated to ${humanize(target)}`);
          setConfirmComplete(false);
        },
      }
    );
  };

  return (
    <div className="stack" style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {/* Cockpit Header Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem 1.25rem",
          borderRadius: "12px",
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)",
          border: "1px solid rgba(56, 189, 248, 0.3)",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.4rem" }}>🚚</span>
            <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "#f8fafc" }}>
              Driver & Operator Cockpit
            </h2>
          </div>
          <p className="small muted" style={{ margin: "0.3rem 0 0 2rem" }}>
            Logged in as <strong style={{ color: "#38bdf8" }}>{me.display_name}</strong> · {me.org_name}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Trip Selector Dropdown */}
          {trips.data && trips.data.length > 1 && (
            <select
              value={activeTrip?.id ?? ""}
              onChange={(e) => setSelectedTripId(e.target.value)}
              style={{
                padding: "0.45rem 0.75rem",
                borderRadius: "6px",
                background: "#0f172a",
                color: "#e2e8f0",
                border: "1px solid #334155",
                fontSize: "0.85rem",
              }}
            >
              {trips.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.trip_code} ({t.status})
                </option>
              ))}
            </select>
          )}

          <Button
            size="small"
            variant="danger"
            onClick={() => setSosActive(!sosActive)}
          >
            {sosActive ? "Dismiss Emergency Mode" : "🚨 EMERGENCY SOS"}
          </Button>
        </div>
      </div>

      {/* Emergency SOS Drawer */}
      {sosActive && (
        <Banner tone="danger" title="⚠️ OPERATOR EMERGENCY BROADCAST ACTIVE">
          <div className="stack">
            <p className="small">
              If your vehicle is stranded due to a landslide, flash flood, or mechanical failure in a remote NER corridor, use these prioritized contact channels immediately:
            </p>
            <div className="grid cols-3" style={{ gap: "0.75rem" }}>
              <div className="card" style={{ padding: "0.75rem" }}>
                <strong>State Disaster Control</strong>
                <p style={{ fontSize: "1.2rem", fontWeight: "bold", margin: "0.25rem 0", color: "#f87171" }}>
                  📞 1070
                </p>
                <span className="small muted">Statewide NER Emergency Ops</span>
              </div>
              <div className="card" style={{ padding: "0.75rem" }}>
                <strong>Police / Highway Patrol</strong>
                <p style={{ fontSize: "1.2rem", fontWeight: "bold", margin: "0.25rem 0", color: "#38bdf8" }}>
                  📞 112
                </p>
                <span className="small muted">All-India Emergency Helpline</span>
              </div>
              <div className="card" style={{ padding: "0.75rem" }}>
                <strong>Central Logistics Dispatch</strong>
                <p style={{ fontSize: "1.2rem", fontWeight: "bold", margin: "0.25rem 0", color: "#fbbf24" }}>
                  📞 0361-2237000
                </p>
                <span className="small muted">PARVA Guwahati Hub Desk</span>
              </div>
            </div>
            <div className="row">
              <Button size="small" onClick={handleCopyCoords}>
                {copiedCoords ? "✓ Coordinates Copied!" : "📋 Copy Current GPS Fix"}
              </Button>
              <Link className="btn small primary" href="/field/report/new">
                Submit Immediate Road Blockage Report
              </Link>
            </div>
          </div>
        </Banner>
      )}

      {!activeTrip ? (
        <Card title="No Active Assigned Trip">
          <p className="muted">
            There are currently no active trips assigned to your fleet organization.
          </p>
          <div className="row" style={{ marginTop: "1rem" }}>
            <Link className="btn primary" href="/logistics/trips">
              View All Trips
            </Link>
            <Link className="btn" href="/logistics/assignments">
              Fleet Assignments
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {/* Active Trip Telemetry & Status Card */}
          <div className="grid cols-3">
            <Card title="Assigned Vehicle">
              {assignedVehicle ? (
                <div className="stack">
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#38bdf8" }}>
                    {assignedVehicle.registration_number}
                  </div>
                  <KeyValue
                    items={[
                      ["Type", humanize(assignedVehicle.vehicle_type)],
                      ["Model", assignedVehicle.make_model],
                      ["Max payload", `${(assignedVehicle.max_weight_kg / 1000).toFixed(1)} T`],
                      ["Clearance height", `${assignedVehicle.height_m.toFixed(2)} m`],
                      ["Refrigerated", assignedVehicle.is_refrigerated ? "Yes (Cold-Chain)" : "No"],
                      ["Hazmat capable", assignedVehicle.is_hazmat_capable ? "Yes (Tier-1)" : "No"],
                    ]}
                  />
                </div>
              ) : (
                <p className="small muted">Vehicle details loading…</p>
              )}
            </Card>

            <Card title="Active Mission">
              <div className="stack">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>{activeTrip.trip_code}</span>
                  <StatusBadge kind="trip" value={activeTrip.status} />
                </div>
                <KeyValue
                  items={[
                    ["Scheduled dep.", formatDateTime(activeTrip.scheduled_departure)],
                    ["Actual departure", activeTrip.actual_departure ? formatDateTime(activeTrip.actual_departure) : "Awaiting departure"],
                    ["Delivery stops", `${activeTrip.stops.length} checkpoint(s)`],
                  ]}
                />
                {linkedCommitments.length > 0 && (
                  <div className="stack" style={{ gap: "0.5rem" }}>
                    <span className="small muted">Consignments on board:</span>
                    <div className="stack" style={{ gap: "0.4rem" }}>
                      {linkedCommitments.map((c) => {
                        const isHandedOver = c.status === "DELIVERED" || c.status === "PARTIALLY_DELIVERED";
                        return (
                          <div
                            key={c.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "0.4rem 0.6rem",
                              borderRadius: "6px",
                              background: "rgba(255, 255, 255, 0.03)",
                              border: "1px solid rgba(255, 255, 255, 0.08)",
                              flexWrap: "wrap",
                              gap: "0.4rem",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <Link
                                href={`/logistics/deliveries/${c.id}`}
                                style={{ fontWeight: 600, fontSize: "0.85rem", color: "#38bdf8", textDecoration: "none" }}
                              >
                                📦 {c.consignment_reference}
                              </Link>
                              <StatusBadge kind="delivery" value={c.status} />
                              <span className="small muted">
                                ({c.delivered_quantity_units}/{c.consigned_quantity_units} units)
                              </span>
                            </div>
                            <div>
                              <Button
                                size="small"
                                variant={isHandedOver ? "default" : "primary"}
                                onClick={() => handleOpenPod(c)}
                              >
                                {isHandedOver ? "✓ Review POD" : "📝 Handover / POD"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Driver GPS Fix">
              <div className="stack">
                {geo.state.status === "ok" ? (
                  <>
                    <p style={{ fontFamily: "monospace", fontSize: "1.05rem", margin: 0 }}>
                      {formatCoords(geo.state.fix.latitude, geo.state.fix.longitude)}
                    </p>
                    <span className="small muted">
                      Accuracy: ±{Math.round(geo.state.fix.accuracy_m)}m · Altitude: {Math.round(geo.state.fix.altitude_m ?? 0)}m
                    </span>
                    <Button size="small" onClick={geo.locate}>
                      Refresh GPS
                    </Button>
                  </>
                ) : geo.state.status === "locating" ? (
                  <p className="small muted">Acquiring satellite lock…</p>
                ) : (
                  <>
                    <p className="small muted">Location not acquired</p>
                    <Button size="small" onClick={geo.locate}>
                      Acquire Position
                    </Button>
                  </>
                )}
              </div>
            </Card>
          </div>

          {/* Quick POD Handover Drawer for Drivers */}
          {podCommitment && (
            <Card title={`Authoritative Proof of Delivery — #${podCommitment.consignment_reference}`}>
              <div className="stack" style={{ gap: "1rem" }}>
                <p className="small muted">
                  Confirm physical cargo handover at destination. POD records recipient signature and GPS fix. Individual delivery completion is decoupled from trip completion.
                </p>

                <div>
                  <span className="small muted" style={{ display: "block", marginBottom: "0.4rem", fontWeight: 600 }}>
                    Select Handover Result:
                  </span>
                  <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                    <Button
                      size="small"
                      variant={podResult === "full" ? "primary" : "default"}
                      onClick={() => handleSelectPodResult("full")}
                    >
                      🟢 Full Handover Complete
                    </Button>
                    <Button
                      size="small"
                      variant={podResult === "partial" ? "primary" : "default"}
                      onClick={() => handleSelectPodResult("partial")}
                    >
                      🟡 Partial Delivery with Shortage
                    </Button>
                    <Button
                      size="small"
                      variant={podResult === "failed" ? "primary" : "default"}
                      onClick={() => handleSelectPodResult("failed")}
                    >
                      🔴 Handover Rejected / Failed
                    </Button>
                  </div>
                </div>

                <div className="grid cols-3" style={{ gap: "0.75rem" }}>
                  <div className="field">
                    <label htmlFor="pod-units">Delivered Units (Total: {podCommitment.consigned_quantity_units})</label>
                    <input
                      id="pod-units"
                      type="number"
                      min="0"
                      max={podCommitment.consigned_quantity_units}
                      value={podDeliveredUnits}
                      onChange={(e) => setPodDeliveredUnits(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="pod-cond">Cargo Condition</label>
                    <select
                      id="pod-cond"
                      value={podCondition}
                      onChange={(e) => setPodCondition(e.target.value)}
                    >
                      <option value="GOOD">Good / Intact Packaging</option>
                      <option value="DAMAGED_PACKAGING">Damaged Outer Packaging</option>
                      <option value="PARTIAL_LOSS">Partial Loss / Short Unload</option>
                      <option value="TEMPERATURE_EXCURSION">Temperature Excursion</option>
                      <option value="REJECTED_BY_RECIPIENT">Rejected by Consignee</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="pod-gps">GPS Tag</label>
                    <input
                      id="pod-gps"
                      type="text"
                      disabled
                      value={geo.state.status === "ok" ? formatCoords(geo.state.fix.latitude, geo.state.fix.longitude) : "Acquiring GPS…"}
                    />
                  </div>
                </div>

                <div className="grid cols-2" style={{ gap: "0.75rem" }}>
                  <div className="field">
                    <label htmlFor="pod-rec-name">Authorized Recipient Name</label>
                    <input
                      id="pod-rec-name"
                      type="text"
                      value={podRecipientName}
                      onChange={(e) => setPodRecipientName(e.target.value)}
                      placeholder="e.g. Dr. H. L. Sarma"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="pod-rec-org">Recipient Organization / Ward</label>
                    <input
                      id="pod-rec-org"
                      type="text"
                      value={podRecipientOrg}
                      onChange={(e) => setPodRecipientOrg(e.target.value)}
                      placeholder="e.g. Guwahati Medical College Pharmacy"
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="pod-shortage">
                    {podResult === "partial" ? "Reason for Shortage / Unloaded Quantity (Required)" : "Handover / Delivery Notes"}
                  </label>
                  <input
                    id="pod-shortage"
                    type="text"
                    value={podShortageReason}
                    onChange={(e) => setPodShortageReason(e.target.value)}
                    placeholder={podResult === "partial" ? "e.g. Heavy rain delayed full unload; remaining units retained on board" : "e.g. Signed and stamped by chief pharmacist"}
                  />
                </div>

                <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
                  <Button onClick={() => setPodCommitment(null)}>Cancel</Button>
                  <Button
                    variant="primary"
                    onClick={handleSubmitPod}
                    disabled={updateCommitmentStatus.isPending}
                  >
                    {updateCommitmentStatus.isPending ? "Submitting…" : "Confirm Handover & Submit POD"}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Real-time Route Hazard Advisories */}
          {tripImpacts.data && tripImpacts.data.length > 0 ? (
            <Banner tone="warn" title="⚠️ Active Corridor Hazards Detected Along Your Route">
              <ul style={{ margin: "0.5rem 0", paddingLeft: "1.25rem" }}>
                {tripImpacts.data.map((imp) => (
                  <li key={imp.id} className="small">
                    <strong>{humanize(imp.impact_type)}</strong> on corridor segment {imp.edge_id.slice(0, 8)}…
                  </li>
                ))}
              </ul>
              <div className="row">
                <Link className="btn small primary" href="/logistics/routes">
                  Compute Autonomous Reroute
                </Link>
              </div>
            </Banner>
          ) : (
            <Banner tone="ok" title="Route Corridor Clear">
              <p className="small">
                No active critical closures or bridge capacity restrictions reported on this scheduled segment. Proceed with normal mountain transit protocol.
              </p>
            </Banner>
          )}

          {/* Fast One-Touch Driver Action Bar */}
          <Card title="One-Touch Operator Actions">
            <div className="stack">
              <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
                {activeTrip.status === "PLANNED" || activeTrip.status === "DISPATCHED" ? (
                  <Button
                    size="large"
                    variant="primary"
                    onClick={() => executeTransition("IN_TRANSIT")}
                    disabled={transition.isPending}
                  >
                    🚀 Start Trip / Depart Origin
                  </Button>
                ) : null}

                {activeTrip.status === "IN_TRANSIT" ? (
                  <>
                    <Button
                      size="large"
                      variant="default"
                      onClick={() => executeTransition("HELD_FOR_INSPECTION")}
                      disabled={transition.isPending}
                    >
                      🛑 Report Checkpoint / Traffic Hold
                    </Button>

                    <Button
                      size="large"
                      variant="default"
                      onClick={() => executeTransition("DIVERTED")}
                      disabled={transition.isPending}
                    >
                      ↩️ Request Divert / Detour
                    </Button>

                    <Button
                      size="large"
                      variant="primary"
                      onClick={() => setConfirmComplete(true)}
                      disabled={transition.isPending}
                    >
                      ✅ Confirm Delivery / Complete Trip
                    </Button>
                  </>
                ) : null}

                {activeTrip.status === "HELD_FOR_INSPECTION" ? (
                  <Button
                    size="large"
                    variant="primary"
                    onClick={() => executeTransition("IN_TRANSIT")}
                    disabled={transition.isPending}
                  >
                    ▶️ Resume Transit
                  </Button>
                ) : null}

                {activeTrip.status === "DIVERTED" ? (
                  <Button
                    size="large"
                    variant="primary"
                    onClick={() => executeTransition("IN_TRANSIT")}
                    disabled={transition.isPending}
                  >
                    ▶️ Transit Resumed on Detour
                  </Button>
                ) : null}

                <Link className="btn large" href="/field/report/new">
                  📷 Report Road Hazard on Route
                </Link>
              </div>

              {confirmComplete && (
                unconfirmedCommitments.length > 0 ? (
                  <Banner tone="warn" title="⚠️ Consignments Pending Authoritative Handover (POD)">
                    <div className="stack" style={{ gap: "0.5rem" }}>
                      <p className="small">
                        <strong>{unconfirmedCommitments.length} consignment(s)</strong> on this mission do not have a recorded Handover / POD:
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                        {unconfirmedCommitments.map((c) => (
                          <Button key={c.id} size="small" variant="primary" onClick={() => handleOpenPod(c)}>
                            📝 Submit POD for #{c.consignment_reference}
                          </Button>
                        ))}
                      </div>
                      <p className="small muted">
                        In accordance with logistics integrity policy, completing this trip will <strong>NOT</strong> automatically mark remaining consignments as DELIVERED. They will remain in their true handover state until POD is signed.
                      </p>
                      <div className="row" style={{ marginTop: "0.5rem" }}>
                        <Button
                          variant="primary"
                          onClick={() => executeTransition("COMPLETED")}
                          disabled={transition.isPending}
                        >
                          Complete Trip Record
                        </Button>
                        <Button onClick={() => setConfirmComplete(false)}>Cancel</Button>
                      </div>
                    </div>
                  </Banner>
                ) : (
                  <Banner tone="ok" title="All Consignments Verified Handed Over">
                    <p className="small">
                      All {linkedCommitments.length} consignment(s) have verified Proof of Handover records. Confirming will finalize and close mission <strong>{activeTrip.trip_code}</strong>.
                    </p>
                    <div className="row" style={{ marginTop: "0.5rem" }}>
                      <Button
                        variant="primary"
                        onClick={() => executeTransition("COMPLETED")}
                        disabled={transition.isPending}
                      >
                        Yes, Finalize & Complete Mission
                      </Button>
                      <Button onClick={() => setConfirmComplete(false)}>Cancel</Button>
                    </div>
                  </Banner>
                )
              )}
            </div>
          </Card>

          {/* Stops Timeline */}
          <Card title="Scheduled Route Checkpoints">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Seq</th>
                    <th scope="col">Stop Type</th>
                    <th scope="col">Coordinates</th>
                    <th scope="col">Planned Arrival</th>
                    <th scope="col">Planned Departure</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTrip.stops.map((stop, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <strong>{humanize(stop.stop_type)}</strong>
                      </td>
                      <td>{formatCoords(stop.lat, stop.lon)}</td>
                      <td>{formatDateTime(stop.planned_arrival)}</td>
                      <td>{formatDateTime(stop.planned_departure)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
