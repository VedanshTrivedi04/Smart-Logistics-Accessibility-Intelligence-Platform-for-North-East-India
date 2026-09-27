"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DeliveryStatus } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { formatDateTime, formatDuration } from "@/shared/lib/time";
import { humanize, shortId } from "@/shared/lib/format";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Package,
  Route,
  ShieldAlert,
  Truck,
  User,
} from "lucide-react";
import { Banner, Button, Card, KeyValue, QueryState, Stat, StatusBadge, useAnnounce } from "@/shared/ui";
import { useFacilities } from "@/features/network";
import {
  useCommitment,
  useCommitments,
  useDrivers,
  useTripImpacts,
  useTrips,
  useUpdateCommitmentStatus,
  useVehicles,
} from "./queries";

export function DeliveryDetail({ deliveryId }: { deliveryId: string }) {
  const { can } = useSession();
  const announce = useAnnounce();
  const commitmentQuery = useCommitment(deliveryId);
  const fallbackCommitments = useCommitments();
  const trips = useTrips();
  const vehicles = useVehicles();
  const drivers = useDrivers();
  const facilities = useFacilities();
  const updateStatus = useUpdateCommitmentStatus();

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [handoverMode, setHandoverMode] = useState<"full" | "partial" | "failed" | "in_transit">("full");
  const [selectedStatus, setSelectedStatus] = useState<DeliveryStatus>("DELIVERED");
  const [deliveredUnits, setDeliveredUnits] = useState<string>("");
  const [shortageReason, setShortageReason] = useState<string>("");
  const [recipientName, setRecipientName] = useState<string>("");
  const [recipientOrg, setRecipientOrg] = useState<string>("");
  const [deliveryCondition, setDeliveryCondition] = useState<string>("GOOD");
  const [signatureAck, setSignatureAck] = useState<string>("");

  // Resolve commitment entity from single query or cache fallback
  const commitment = useMemo(() => {
    if (commitmentQuery.data) return commitmentQuery.data;
    return fallbackCommitments.data?.find((c) => c.id === deliveryId) ?? null;
  }, [commitmentQuery.data, fallbackCommitments.data, deliveryId]);

  // Find linked trip
  const linkedTrip = useMemo(() => {
    if (!commitment) return null;
    return (trips.data ?? []).find((t) => t.commitment_ids.includes(commitment.id)) ?? null;
  }, [commitment, trips.data]);

  // Find linked vehicle and driver from trip
  const assignedVehicle = useMemo(() => {
    if (!linkedTrip) return null;
    return vehicles.data?.find((v) => v.id === linkedTrip.vehicle_id) ?? null;
  }, [linkedTrip, vehicles.data]);

  const assignedDriver = useMemo(() => {
    if (!linkedTrip) return null;
    return drivers.data?.find((d) => d.id === linkedTrip.driver_id) ?? null;
  }, [linkedTrip, drivers.data]);

  // Check disruption impacts on linked trip
  const tripImpacts = useTripImpacts(linkedTrip?.id ?? null);

  const facilityName = (id: string | null | undefined) => {
    if (!id) return "Unknown Station";
    const f = facilities.data?.find((item) => item.id === id);
    return f ? f.name : shortId(id);
  };

  const handleOpenStatusForm = () => {
    if (!commitment) return;
    setHandoverMode(commitment.status === "PARTIALLY_DELIVERED" ? "partial" : "full");
    setSelectedStatus(commitment.status === "PENDING" ? "IN_TRANSIT" : commitment.status);
    setDeliveredUnits(String(commitment.delivered_quantity_units > 0 ? commitment.delivered_quantity_units : commitment.consigned_quantity_units));
    setShortageReason(commitment.shortage_reason ?? "");
    setRecipientName(commitment.recipient_name ?? "");
    setRecipientOrg(commitment.recipient_organization ?? "");
    setDeliveryCondition(commitment.delivery_condition ?? "GOOD");
    setSignatureAck(commitment.pod_signature_acknowledgement ?? "");
    setIsUpdatingStatus(!isUpdatingStatus);
  };

  const handleSelectMode = (mode: "full" | "partial" | "failed" | "in_transit") => {
    if (!commitment) return;
    setHandoverMode(mode);
    if (mode === "full") {
      setSelectedStatus("DELIVERED");
      setDeliveredUnits(String(commitment.consigned_quantity_units));
      setDeliveryCondition("GOOD");
    } else if (mode === "partial") {
      setSelectedStatus("PARTIALLY_DELIVERED");
      const half = Math.max(1, Math.floor(commitment.consigned_quantity_units * 0.8));
      setDeliveredUnits(String(half));
      setDeliveryCondition("PARTIAL_LOSS");
    } else if (mode === "failed") {
      setSelectedStatus("FAILED");
      setDeliveredUnits("0");
      setDeliveryCondition("REJECTED_BY_RECIPIENT");
    } else if (mode === "in_transit") {
      setSelectedStatus("IN_TRANSIT");
      setDeliveredUnits("0");
    }
  };

  const handleUpdateStatus = () => {
    if (!commitment) return;
    const units = deliveredUnits.trim() !== "" ? parseInt(deliveredUnits, 10) : undefined;
    updateStatus.mutate(
      {
        commitmentId: commitment.id,
        status: selectedStatus,
        deliveredUnits: isNaN(units ?? NaN) ? undefined : units,
        shortageReason: shortageReason.trim() !== "" ? shortageReason.trim() : undefined,
        recipientName: recipientName.trim() !== "" ? recipientName.trim() : undefined,
        recipientOrganization: recipientOrg.trim() !== "" ? recipientOrg.trim() : undefined,
        deliveryCondition: deliveryCondition.trim() !== "" ? deliveryCondition.trim() : undefined,
        podSignatureAcknowledgement: signatureAck.trim() !== "" ? signatureAck.trim() : undefined,
      },
      {
        onSuccess: () => {
          announce(`Delivery status updated to ${humanize(selectedStatus)}`);
          setIsUpdatingStatus(false);
        },
      }
    );
  };

  const shortageUnits = useMemo(() => {
    if (!commitment) return 0;
    const entered = parseInt(deliveredUnits, 10);
    if (isNaN(entered)) return 0;
    return Math.max(0, commitment.consigned_quantity_units - entered);
  }, [commitment, deliveredUnits]);

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      {/* Back button & Action Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <Link
          href="/logistics/deliveries"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            color: "#64748b",
            fontSize: "0.9rem",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={16} /> Back to Deliveries
        </Link>

        {(can("DISPATCH_ROUTE") || can("SUBMIT_GPS")) && commitment && (
          <Button
            size="small"
            variant="primary"
            onClick={handleOpenStatusForm}
          >
            {isUpdatingStatus ? "Close Status Form" : "Update Delivery Status / POD Handover"}
          </Button>
        )}
      </div>

      <QueryState
        query={commitmentQuery}
        subject="delivery commitment"
        isEmpty={() => commitment === null}
        emptyMessage={`Delivery commitment '${deliveryId}' could not be located in your organization.`}
      >
        {() => {
          if (!commitment) return null;

          return (
            <div className="stack" style={{ gap: "1.5rem" }}>
              {/* Delivery Header Banner */}
              <div
                style={{
                  padding: "1.25rem 1.5rem",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span style={{ fontSize: "1.5rem" }}>📦</span>
                      <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "#f8fafc" }}>
                        Consignment #{commitment.consignment_reference}
                      </h1>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                      <StatusBadge kind="delivery" value={commitment.status} />
                      <StatusBadge kind="sla" value={commitment.sla_status} />
                      <StatusBadge kind="priority" value={commitment.priority_tier} />
                      <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                        Category: <strong style={{ color: "#e2e8f0" }}>{humanize(commitment.cargo_category)}</strong>
                      </span>
                      {commitment.is_hazmat && (
                        <span style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", borderRadius: "4px", background: "rgba(239, 68, 68, 0.2)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.3)", fontWeight: 600 }}>
                          ☣️ Hazmat Certified
                        </span>
                      )}
                      {commitment.requires_cold_chain && (
                        <span style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", borderRadius: "4px", background: "rgba(56, 189, 248, 0.2)", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.3)", fontWeight: 600 }}>
                          ❄️ Cold-Chain Sensitive
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Required Delivery Deadline</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: commitment.sla_status === "BREACHED" ? "#f87171" : "#38bdf8", marginTop: "0.2rem" }}>
                      {formatDateTime(commitment.required_before)}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Created {formatDateTime(commitment.created_at)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Previous Trip Cancellation / Release History */}
              {commitment.previous_trip_code && commitment.status === "PENDING" && (
                <Banner tone="warn" title="⚠️ Consignment Released from Cancelled Mission">
                  <div className="stack" style={{ gap: "0.25rem" }}>
                    <p className="small" style={{ margin: 0 }}>
                      This consignment was previously assigned to <strong>Trip {commitment.previous_trip_code}</strong> (Status: <strong>{commitment.previous_trip_status ?? "CANCELLED"}</strong>).
                    </p>
                    <div className="small muted">
                      Cancellation Note: <strong>{commitment.cancellation_reason ?? "Trip aborted/cancelled"}</strong>
                      {commitment.released_at && ` · Released to unassigned queue at ${formatDateTime(commitment.released_at)}`}
                    </div>
                  </div>
                </Banner>
              )}

              {/* Status Update / Proof of Delivery Drawer */}
              {isUpdatingStatus && (
                <Card title="Authoritative Proof of Delivery (POD) & Handover Confirmation">
                  <div className="stack" style={{ gap: "1.25rem" }}>
                    <p className="small muted">
                      Record official destination handover with recipient acknowledgement. Delivery completion requires explicit handover confirmation per consignment rather than blanket trip completion.
                    </p>

                    {/* Quick Result Selector */}
                    <div>
                      <span className="small muted" style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                        Select Handover Result:
                      </span>
                      <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                        <Button
                          size="small"
                          variant={handoverMode === "full" ? "primary" : "default"}
                          onClick={() => handleSelectMode("full")}
                        >
                          🟢 Full Delivery Handover
                        </Button>
                        <Button
                          size="small"
                          variant={handoverMode === "partial" ? "primary" : "default"}
                          onClick={() => handleSelectMode("partial")}
                        >
                          🟡 Partial Delivery with Shortage
                        </Button>
                        <Button
                          size="small"
                          variant={handoverMode === "failed" ? "primary" : "default"}
                          onClick={() => handleSelectMode("failed")}
                        >
                          🔴 Delivery Attempt Failed
                        </Button>
                        <Button
                          size="small"
                          variant={handoverMode === "in_transit" ? "primary" : "default"}
                          onClick={() => handleSelectMode("in_transit")}
                        >
                          🚚 Mark In Transit
                        </Button>
                      </div>
                    </div>

                    <div className="grid cols-3" style={{ gap: "1rem" }}>
                      <div className="field">
                        <label htmlFor="del-status">Target Status</label>
                        <select
                          id="del-status"
                          value={selectedStatus}
                          onChange={(e) => setSelectedStatus(e.target.value as DeliveryStatus)}
                        >
                          <option value="IN_TRANSIT">In Transit</option>
                          <option value="DELIVERED">Delivered (Handover Complete)</option>
                          <option value="PARTIALLY_DELIVERED">Partially Delivered</option>
                          <option value="FAILED">Delivery Failed</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </div>

                      <div className="field">
                        <label htmlFor="del-units">
                          Delivered Units (of {commitment.consigned_quantity_units} total)
                        </label>
                        <input
                          id="del-units"
                          type="number"
                          min="0"
                          max={commitment.consigned_quantity_units}
                          value={deliveredUnits}
                          onChange={(e) => setDeliveredUnits(e.target.value)}
                          placeholder={`Max ${commitment.consigned_quantity_units} units`}
                        />
                        {shortageUnits > 0 && (
                          <span style={{ fontSize: "0.75rem", color: "#f87171", marginTop: "0.2rem" }}>
                            Shortage calculated: <strong>{shortageUnits} units missing</strong>
                          </span>
                        )}
                      </div>

                      <div className="field">
                        <label htmlFor="del-condition">Cargo Condition</label>
                        <select
                          id="del-condition"
                          value={deliveryCondition}
                          onChange={(e) => setDeliveryCondition(e.target.value)}
                        >
                          <option value="GOOD">Good / Intact Packaging</option>
                          <option value="DAMAGED_PACKAGING">Damaged Outer Packaging</option>
                          <option value="PARTIAL_LOSS">Partial Loss / Short Unload</option>
                          <option value="TEMPERATURE_EXCURSION">Temperature Excursion</option>
                          <option value="REJECTED_BY_RECIPIENT">Rejected by Consignee</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid cols-3" style={{ gap: "1rem" }}>
                      <div className="field">
                        <label htmlFor="pod-rec-name">Authorized Recipient Name</label>
                        <input
                          id="pod-rec-name"
                          type="text"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="e.g. Dr. H. L. Sarma"
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="pod-rec-org">Recipient Organization / Ward</label>
                        <input
                          id="pod-rec-org"
                          type="text"
                          value={recipientOrg}
                          onChange={(e) => setRecipientOrg(e.target.value)}
                          placeholder="e.g. Guwahati Medical College Pharmacy"
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="pod-sig-ack">Signature / Acknowledgement ID</label>
                        <input
                          id="pod-sig-ack"
                          type="text"
                          value={signatureAck}
                          onChange={(e) => setSignatureAck(e.target.value)}
                          placeholder="e.g. SIGN-GMCH-2026-99"
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="del-shortage">
                        {handoverMode === "partial" || shortageUnits > 0
                          ? "Shortage Rationale & Access Obstruction Notes (Required)"
                          : "Handover / Exception Notes"}
                      </label>
                      <input
                        id="del-shortage"
                        type="text"
                        value={shortageReason}
                        onChange={(e) => setShortageReason(e.target.value)}
                        placeholder={
                          handoverMode === "partial"
                            ? "Explain reason for shortage (e.g. Access blocked; unloaded remaining at intermediate depot)"
                            : "e.g. Received in good order at receiving dock"
                        }
                      />
                    </div>

                    <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
                      <Button onClick={() => setIsUpdatingStatus(false)}>Cancel</Button>
                      <Button variant="primary" onClick={handleUpdateStatus} disabled={updateStatus.isPending}>
                        {updateStatus.isPending ? "Submitting POD…" : "Submit Authoritative POD"}
                      </Button>
                    </div>

                    {updateStatus.isError && (
                      <Banner tone="danger" title="Status Update Failed">
                        {updateStatus.error instanceof Error ? updateStatus.error.message : "An unexpected server error occurred."}
                      </Banner>
                    )}
                  </div>
                </Card>
              )}

              {/* Disruption Alert if linked trip is affected */}
              {tripImpacts.data && tripImpacts.data.length > 0 && (
                <Banner tone="danger" title="⚠️ Active Corridor Disruption Detected">
                  <div className="stack" style={{ gap: "0.4rem" }}>
                    <p className="small">
                      The assigned route for this consignment has been impacted by road network hazards assessed by verified field inspectors:
                    </p>
                    {tripImpacts.data.map((imp) => (
                      <div key={imp.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", fontSize: "0.85rem" }}>
                        <StatusBadge kind="impact" value={imp.impact_type} />
                        <StatusBadge kind="severity" value={imp.severity} />
                        <span>Estimated delay: <strong>+{formatDuration(imp.delay_estimated_seconds)}</strong></span>
                        <span className="badge tone-warn">{humanize(imp.recommended_action)}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: "0.4rem" }}>
                      <Link className="btn small" href="/logistics/disruptions">
                        Open Disruptions Desk & Directives
                      </Link>
                    </div>
                  </div>
                </Banner>
              )}

              {/* Main 2-Column Split: Dossier Overview vs Operational Assignment */}
              <div className="grid cols-2" style={{ gap: "1.25rem" }}>
                {/* Left Column: Consignment Dossier */}
                <Card title="Consignment Cargo Specs">
                  <div className="stack" style={{ gap: "0.8rem" }}>
                    {(() => {
                      const items: [string, React.ReactNode][] = [
                        ["Reference ID", <span key="ref" className="mono">{commitment.consignment_reference}</span>],
                        ["Cargo Classification", humanize(commitment.cargo_category)],
                        ["Priority Tier", <StatusBadge key="p" kind="priority" value={commitment.priority_tier} />],
                        ["Consigned Weight", `${commitment.consigned_weight_kg.toLocaleString()} kg (${(commitment.consigned_weight_kg / 1000).toFixed(2)} T)`],
                        ["Cargo Volume", commitment.consigned_volume_m3 ? `${commitment.consigned_volume_m3.toFixed(2)} m³` : "Not specified"],
                        ["Quantity Units", `${commitment.delivered_quantity_units} / ${commitment.consigned_quantity_units} units delivered`],
                      ];
                      if (commitment.status === "PARTIALLY_DELIVERED" && commitment.consigned_quantity_units > commitment.delivered_quantity_units) {
                        items.push(["Delivery Shortage", <span key="short" style={{ color: "#f87171", fontWeight: 600 }}>{commitment.consigned_quantity_units - commitment.delivered_quantity_units} units shortage</span>]);
                      }
                      if (commitment.recipient_name) {
                        items.push(["Consignee Handover", `${commitment.recipient_name}${commitment.recipient_organization ? ` (${commitment.recipient_organization})` : ""}`]);
                      }
                      if (commitment.pod_timestamp) {
                        items.push(["Handover Verified", formatDateTime(commitment.pod_timestamp)]);
                      }
                      if (commitment.delivery_condition) {
                        items.push(["Cargo Condition", humanize(commitment.delivery_condition)]);
                      }
                      if (commitment.pod_signature_acknowledgement) {
                        items.push(["Handover Acknowledgement", commitment.pod_signature_acknowledgement]);
                      }
                      items.push(
                        ["Origin Facility", facilityName(commitment.origin_facility_id)],
                        ["Destination Facility", facilityName(commitment.destination_facility_id)],
                        ["SLA Status", <StatusBadge key="sla" kind="sla" value={commitment.sla_status} />],
                        ["Shortage / Handover Notes", commitment.shortage_reason ? commitment.shortage_reason : "None reported"]
                      );
                      return <KeyValue items={items} />;
                    })()}
                  </div>
                </Card>

                {/* Right Column: Fleet Operational Assignment */}
                <Card title="Operational Assignment & Fleet Allocation">
                  <div className="stack" style={{ gap: "1rem" }}>
                    {linkedTrip ? (
                      <>
                        <div
                          style={{
                            padding: "0.8rem 1rem",
                            borderRadius: "8px",
                            background: "rgba(56, 189, 248, 0.08)",
                            border: "1px solid rgba(56, 189, 248, 0.2)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <span className="small muted">Assigned Trip Code:</span>
                              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#38bdf8" }}>
                                {linkedTrip.trip_code}
                              </div>
                            </div>
                            <StatusBadge kind="trip" value={linkedTrip.status} />
                          </div>
                          <div style={{ marginTop: "0.5rem" }}>
                            <Link
                              href={`/logistics/trips/${linkedTrip.id}`}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem", color: "#38bdf8" }}
                            >
                              <Route size={14} /> View Full Trip Route & Stops <ExternalLink size={12} />
                            </Link>
                          </div>
                        </div>

                        <div className="grid cols-2" style={{ gap: "0.75rem" }}>
                          <div
                            style={{
                              padding: "0.75rem",
                              borderRadius: "8px",
                              background: "rgba(255, 255, 255, 0.03)",
                              border: "1px solid rgba(255, 255, 255, 0.08)",
                            }}
                          >
                            <span className="small muted" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <Truck size={14} /> Assigned Vehicle
                            </span>
                            {assignedVehicle ? (
                              <div style={{ marginTop: "0.4rem" }}>
                                <Link
                                  href={`/logistics/vehicles/${assignedVehicle.id}`}
                                  style={{ fontWeight: 600, color: "#f8fafc", textDecoration: "none" }}
                                >
                                  {assignedVehicle.registration_number}
                                </Link>
                                <div className="small muted" style={{ marginTop: "0.2rem" }}>
                                  {humanize(assignedVehicle.vehicle_type)} · {(assignedVehicle.max_weight_kg / 1000).toFixed(1)}T payload
                                </div>
                              </div>
                            ) : (
                              <div className="small muted" style={{ marginTop: "0.4rem" }}>Loading vehicle…</div>
                            )}
                          </div>

                          <div
                            style={{
                              padding: "0.75rem",
                              borderRadius: "8px",
                              background: "rgba(255, 255, 255, 0.03)",
                              border: "1px solid rgba(255, 255, 255, 0.08)",
                            }}
                          >
                            <span className="small muted" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <User size={14} /> Assigned Driver
                            </span>
                            {assignedDriver ? (
                              <div style={{ marginTop: "0.4rem" }}>
                                <Link
                                  href={`/logistics/drivers/${assignedDriver.id}`}
                                  style={{ fontWeight: 600, color: "#f8fafc", textDecoration: "none" }}
                                >
                                  {assignedDriver.full_name}
                                </Link>
                                <div className="small muted" style={{ marginTop: "0.2rem" }}>
                                  License: {assignedDriver.license_number}
                                </div>
                              </div>
                            ) : (
                              <div className="small muted" style={{ marginTop: "0.4rem" }}>Loading driver…</div>
                            )}
                          </div>
                        </div>

                        <KeyValue
                          items={[
                            ["Scheduled Departure", formatDateTime(linkedTrip.scheduled_departure)],
                            ["Actual Departure", linkedTrip.actual_departure ? formatDateTime(linkedTrip.actual_departure) : "Awaiting dispatch departure"],
                            ["Actual Arrival", linkedTrip.actual_arrival ? formatDateTime(linkedTrip.actual_arrival) : "In transit / not arrived"],
                            ["Route Stops Count", `${linkedTrip.stops.length} scheduled checkpoints`],
                          ]}
                        />
                      </>
                    ) : (
                      <div className="stack" style={{ gap: "0.8rem", padding: "1.25rem", textAlign: "center" }}>
                        <div style={{ fontSize: "2rem" }}>📦</div>
                        <h4 style={{ margin: 0 }}>Consignment Unassigned</h4>
                        <p className="small muted">
                          This delivery commitment is currently unallocated. It has not been paired with a vehicle or driver.
                        </p>
                        {can("DISPATCH_ROUTE") && (
                          <div style={{ marginTop: "0.5rem" }}>
                            <Link className="btn primary small" href={`/logistics/assignments?consignmentId=${commitment.id}`}>
                              Open Assignment Wizard to Dispatch
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Delivery Milestones Timeline */}
              <Card title="Delivery Progress & Handover Milestones">
                <ol className="timeline">
                  {/* Step 1: Consignment Registered */}
                  <li>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <CheckCircle2 size={16} color="#38bdf8" />
                      <strong>Consignment Created & Logged</strong>
                      <span className="small muted">· {formatDateTime(commitment.created_at)}</span>
                    </div>
                    <div className="small muted">
                      Booking registered with priority {humanize(commitment.priority_tier)} for transport from {facilityName(commitment.origin_facility_id)} to {facilityName(commitment.destination_facility_id)}.
                    </div>
                  </li>

                  {/* Step 2: Trip & Resource Allocation */}
                  <li>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {linkedTrip ? <CheckCircle2 size={16} color="#38bdf8" /> : <Clock size={16} color="#94a3b8" />}
                      <strong>Fleet & Driver Assignment</strong>
                      {linkedTrip && <span className="small muted">· Linked to Trip {linkedTrip.trip_code}</span>}
                    </div>
                    <div className="small muted">
                      {linkedTrip
                        ? `Assigned to vehicle ${assignedVehicle?.registration_number ?? "—"} and driver ${assignedDriver?.full_name ?? "—"}.`
                        : "Pending assignment in the Fleet Ops Desk."}
                    </div>
                  </li>

                  {/* Step 3: Departure */}
                  <li>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {linkedTrip?.actual_departure ? <CheckCircle2 size={16} color="#38bdf8" /> : <Clock size={16} color="#94a3b8" />}
                      <strong>Dispatched & Departed Origin</strong>
                      {linkedTrip?.actual_departure && <span className="small muted">· {formatDateTime(linkedTrip.actual_departure)}</span>}
                    </div>
                    <div className="small muted">
                      {linkedTrip?.actual_departure
                        ? `Vehicle departed from ${facilityName(commitment.origin_facility_id)}.`
                        : "Cargo awaiting loading and vehicle departure."}
                    </div>
                  </li>

                  {/* Step 4: In-Transit / Disruption */}
                  <li>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {commitment.status === "IN_TRANSIT" || commitment.status === "DELIVERED" ? (
                        <CheckCircle2 size={16} color="#38bdf8" />
                      ) : (
                        <Clock size={16} color="#94a3b8" />
                      )}
                      <strong>In-Transit Route Execution</strong>
                    </div>
                    <div className="small muted">
                      {tripImpacts.data && tripImpacts.data.length > 0
                        ? `Route assessed with active corridor disruptions (${tripImpacts.data.length} active warnings).`
                        : "Transit progressing on designated North-East lifeline corridor."}
                    </div>
                  </li>

                  {/* Step 5: Delivery & POD */}
                  <li>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {commitment.status === "DELIVERED" ? (
                        <CheckCircle2 size={16} color="#22c55e" />
                      ) : (
                        <Clock size={16} color="#94a3b8" />
                      )}
                      <strong>Destination Handover & Verification</strong>
                      {commitment.status === "DELIVERED" && linkedTrip?.actual_arrival && (
                        <span className="small muted">· {formatDateTime(linkedTrip.actual_arrival)}</span>
                      )}
                    </div>
                    <div className="small muted">
                      {commitment.status === "DELIVERED"
                        ? `Handover completed at ${facilityName(commitment.destination_facility_id)}. Delivered: ${commitment.delivered_quantity_units} / ${commitment.consigned_quantity_units} units.`
                        : `Awaiting delivery confirmation before deadline ${formatDateTime(commitment.required_before)}.`}
                    </div>
                  </li>
                </ol>
              </Card>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
