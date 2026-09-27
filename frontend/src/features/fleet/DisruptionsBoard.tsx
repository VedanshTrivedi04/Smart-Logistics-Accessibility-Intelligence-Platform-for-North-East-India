"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ShieldAlert,
  Clock,
  Route as RouteIcon,
  Truck,
  User,
  ExternalLink,
  MessageSquare,
  CheckCircle2,
  FileText,
  AlertCircle,
  HelpCircle,
  Eye,
  RefreshCw,
  Send,
} from "lucide-react";
import { useSession } from "@/shared/auth";
import { useImpactData } from "@/features/impact";
import { useEdgeImpacts } from "@/features/impact/useEdgeImpacts";
import { useVehicles, useDrivers } from "./queries";
import { useCoordinationSummaries, useRecordCoordinationAction } from "@/features/coordination/queries";
import { RiskExplainerDrawer } from "@/features/routing";
import { PageHeader, Button, Card, Banner, StatusBadge } from "@/shared/ui";
import { formatDuration } from "@/shared/lib/time";
import { humanize, shortId } from "@/shared/lib/format";
import type { TripImpact, Trip, Commitment, CoordinationActionType } from "@/shared/api";

const SEVERITY_BADGE_MAP: Record<string, "danger" | "warn" | "neutral"> = {
  CRITICAL: "danger",
  MAJOR: "danger",
  MODERATE: "warn",
  MINOR: "neutral",
};

const ACTION_BADGE_MAP: Record<string, "danger" | "warn" | "neutral" | "ok"> = {
  REROUTE_ADVISORY: "danger",
  PROCEED_WITH_CAUTION: "warn",
  HOLD_AT_FACILITY: "danger",
};

export function DisruptionsBoard() {
  const { can } = useSession();
  const impactData = useImpactData();
  const vehiclesQuery = useVehicles();
  const driversQuery = useDrivers();

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedTripForCoordination, setSelectedTripForCoordination] = useState<Trip | null>(null);

  const vehicleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vehiclesQuery.data ?? []) m.set(v.id, v.registration_number);
    return m;
  }, [vehiclesQuery.data]);

  const driverMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of driversQuery.data ?? []) m.set(d.id, d.full_name);
    return m;
  }, [driversQuery.data]);

  // Group active trip impacts
  const activeDisruptedTrips = useMemo(() => {
    return impactData.tripImpacts.filter((item) => item.impact.is_active);
  }, [impactData.tripImpacts]);

  // Distinct affected edges
  const affectedEdgeIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of activeDisruptedTrips) {
      if (t.impact.edge_id) s.add(t.impact.edge_id);
    }
    return Array.from(s);
  }, [activeDisruptedTrips]);

  const totalDelaySec = useMemo(() => {
    return activeDisruptedTrips.reduce((acc, t) => acc + (t.impact.delay_estimated_seconds ?? 0), 0);
  }, [activeDisruptedTrips]);

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <PageHeader
        title="Fleet Disruption Intelligence"
        subtitle="Real-time operational impacts on active trips caused by verified road blockages, landslides, and infrastructure damage."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                fontSize: "0.85rem",
                color: activeDisruptedTrips.length > 0 ? "#b91c1c" : "#15803d",
                fontWeight: 600,
                background: activeDisruptedTrips.length > 0 ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
                padding: "4px 10px",
                borderRadius: "6px",
              }}
            >
              <ShieldAlert size={15} />
              {activeDisruptedTrips.length} Active Trip {activeDisruptedTrips.length === 1 ? "Disruption" : "Disruptions"}
            </span>
          </div>
        }
      />

      {/* Operational Disclaimer Banner */}
      <Banner tone="info" title="Fleet Operational Scope & Boundaries">
        Road status is authoritatively verified by Field Personnel & Road Inspectors. Fleet Ops does not alter road conditions directly; this desk monitors downstream trip delays, reviews AI reroute recommendations, and records operational coordination directives for drivers.
      </Banner>

      {/* KPIs Summary */}
      <div className="grid cols-3" style={{ gap: "1rem" }}>
        <Card title="Disrupted Trips">
          <div style={{ fontSize: "2rem", fontWeight: 700, color: activeDisruptedTrips.length > 0 ? "#dc2626" : "#16a34a" }}>
            {activeDisruptedTrips.length}
          </div>
          <span className="small muted">
            {activeDisruptedTrips.length === 0 ? "All in-transit trips proceeding normally" : "Require driver advisory or route adjustment"}
          </span>
        </Card>
        <Card title="Impacted Road Segments">
          <div style={{ fontSize: "2rem", fontWeight: 700, color: affectedEdgeIds.length > 0 ? "#ea580c" : "#16a34a" }}>
            {affectedEdgeIds.length}
          </div>
          <span className="small muted">Corridors with confirmed blockages or hazards</span>
        </Card>
        <Card title="Cumulative Delay Incurred">
          <div style={{ fontSize: "2rem", fontWeight: 700, color: totalDelaySec > 0 ? "#d97706" : "#16a34a" }}>
            {formatDuration(totalDelaySec)}
          </div>
          <span className="small muted">Estimated across active consignments</span>
        </Card>
      </div>

      {/* Disrupted Trips Table */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertTriangle size={18} color="#ef4444" />
            <span>Active Trips Impacted by Road Network Blockages</span>
          </div>
        }
      >
        {impactData.loading ? (
          <p className="muted">Evaluating active fleet trajectories against road network state…</p>
        ) : activeDisruptedTrips.length === 0 ? (
          <div style={{ padding: "2rem 0", textAlign: "center" }} className="muted">
            <CheckCircle2 size={36} color="#10b981" style={{ margin: "0 auto 0.5rem auto" }} />
            <p style={{ fontWeight: 600, color: "#166534" }}>No Fleet Disruptions Detected</p>
            <p className="small">All scheduled and dispatched vehicles have clear corridors to their destination facilities.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Trip / Code</th>
                  <th>Vehicle & Driver</th>
                  <th>Recommended Directive</th>
                  <th>Estimated Delay</th>
                  <th>Disruption Distance</th>
                  <th>Impacted Road Segment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeDisruptedTrips.map(({ impact, trip, commitments }) => {
                  const vehReg = vehicleMap.get(trip.vehicle_id) ?? shortId(trip.vehicle_id);
                  const drvName = driverMap.get(trip.driver_id) ?? shortId(trip.driver_id);
                  const isActionMandatory = impact.recommended_action === "REROUTE_ADVISORY" || impact.recommended_action === "HOLD_AT_FACILITY";

                  return (
                    <tr key={impact.id} style={{ background: isActionMandatory ? "rgba(239, 68, 68, 0.03)" : undefined }}>
                      <td>
                        <Link href={`/logistics/trips/${trip.id}`} style={{ fontWeight: 600, color: "#2563eb" }}>
                          {trip.trip_code}
                        </Link>
                        <div className="small muted">
                          Status: <span className="badge neutral">{trip.status}</span>
                        </div>
                        {commitments.length > 0 ? (
                          <div className="small muted" style={{ marginTop: "2px" }}>
                            Cargo: {commitments.map((c) => c.consignment_reference).join(", ")}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <Truck size={14} className="muted" />
                          <strong>{vehReg}</strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginTop: "2px" }}>
                          <User size={14} className="muted" />
                          <span className="small">{drvName}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${ACTION_BADGE_MAP[impact.recommended_action] ?? "neutral"}`}>
                          {humanize(impact.recommended_action)}
                        </span>
                        <div className="small muted" style={{ marginTop: "2px" }}>
                          Severity: <span className={`badge ${SEVERITY_BADGE_MAP[impact.severity] ?? "neutral"}`}>{impact.severity}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontWeight: 600, color: "#b91c1c" }}>
                          <Clock size={14} />
                          +{formatDuration(impact.delay_estimated_seconds)}
                        </div>
                      </td>
                      <td>
                        {impact.distance_to_disruption_meters !== null ? (
                          <span>{(impact.distance_to_disruption_meters / 1000).toFixed(1)} km away</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {impact.edge_id ? (
                          <Button
                            size="small"
                            variant="default"
                            onClick={() => setSelectedEdgeId(impact.edge_id)}
                            style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                          >
                            <Eye size={12} style={{ marginRight: "3px" }} />
                            Inspect Segment {shortId(impact.edge_id)}
                          </Button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <Link href={`/logistics/trips/${trip.id}`}>
                            <Button size="small" variant="default" title="View Trip & Reroute Engine">
                              <RouteIcon size={13} style={{ marginRight: "3px" }} /> Reroute
                            </Button>
                          </Link>
                          {can("COORDINATE_RESPONSE") && (
                            <Button
                              size="small"
                              variant="primary"
                              onClick={() => setSelectedTripForCoordination(trip)}
                              title="Record fleet coordination directive"
                            >
                              <MessageSquare size={13} style={{ marginRight: "3px" }} /> Coordinate
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edge Risk Explainer Drawer */}
      {selectedEdgeId && (
        <RiskExplainerDrawer
          edgeId={selectedEdgeId}
          edgeLabel={`Segment ${shortId(selectedEdgeId)}`}
          onClose={() => setSelectedEdgeId(null)}
        />
      )}

      {/* Coordination Directive Modal / Dialog */}
      {selectedTripForCoordination && (
        <TripCoordinationDialog
          trip={selectedTripForCoordination}
          onClose={() => setSelectedTripForCoordination(null)}
        />
      )}
    </div>
  );
}

function TripCoordinationDialog({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const [actionType, setActionType] = useState<CoordinationActionType>("NOTE");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const summariesQuery = useCoordinationSummaries("TRIP", trip.id);
  const recordAction = useRecordCoordinationAction();

  const handleRecord = async () => {
    setErrorMsg(null);
    if (!notes.trim()) {
      setErrorMsg("Please enter coordination notes or operational instructions.");
      return;
    }

    try {
      await recordAction.mutateAsync({
        subject_type: "TRIP",
        subject_ref: trip.id,
        action: actionType,
        notes: notes.trim(),
      });
      setNotes("");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to record coordination action.");
    }
  };

  const actionsList = summariesQuery.data?.[0]?.actions ?? [];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e2e8f0)",
          borderRadius: "10px",
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "1.2rem", borderBottom: "1px solid var(--border-color, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Fleet Coordination & Directives</h3>
            <span className="small muted">Trip: <strong>{trip.trip_code}</strong> (ID: {shortId(trip.id)})</span>
          </div>
          <Button size="small" variant="default" onClick={onClose}>
            Close
          </Button>
        </div>

        <div style={{ padding: "1.2rem", overflowY: "auto", flex: 1 }} className="stack">
          {/* Action Log History */}
          <div>
            <span style={{ fontWeight: 600, fontSize: "0.85rem", display: "block", marginBottom: "0.5rem" }}>
              Logged Coordination Directives ({actionsList.length})
            </span>
            {actionsList.length === 0 ? (
              <p className="small muted">No coordination directives logged yet for this trip.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {actionsList.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "0.6rem 0.8rem",
                      background: "var(--bg-subtle, #f8fafc)",
                      border: "1px solid var(--border-color, #e2e8f0)",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                      <span className="badge neutral">{humanize(a.action)}</span>
                      <span className="small muted">
                        {new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div>{a.notes}</div>
                    <div className="small muted" style={{ marginTop: "2px" }}>
                      By: {a.actor_id}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form to record new action */}
          <div style={{ borderTop: "1px solid var(--border-color, #e2e8f0)", paddingTop: "1rem" }} className="stack">
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Record Operational Directive</span>

            <div className="field">
              <label htmlFor="coord-action-type" className="small">Action Type</label>
              <select
                id="coord-action-type"
                value={actionType}
                onChange={(e) => setActionType(e.target.value as CoordinationActionType)}
              >
                <option value="NOTE">Operational Note / Directive to Driver</option>
                <option value="ACKNOWLEDGE">Acknowledge Road Blockage Impact</option>
                <option value="ESCALATE">Escalate to State Emergency Command</option>
                <option value="REQUEST_INSPECTION">Request Route Re-inspection</option>
                <option value="ASSIGN">Assign Route Investigation</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="coord-notes" className="small">Operational Details & Message to Operator *</label>
              <textarea
                id="coord-notes"
                rows={3}
                placeholder="e.g. Informed Driver Jayashree of NH-6 landslide blockage; recommended taking diversion via alternative corridor."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {errorMsg ? (
              <div style={{ color: "#ef4444", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button size="small" variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="small"
                variant="primary"
                busy={recordAction.isPending}
                onClick={handleRecord}
              >
                <Send size={13} style={{ marginRight: "4px" }} /> Log Directive
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

