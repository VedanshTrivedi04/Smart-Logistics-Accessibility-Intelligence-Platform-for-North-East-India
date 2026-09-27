"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "@/shared/auth";
import { useOffline } from "@/features/field/OfflineProvider";
import { useGeolocation } from "@/features/field/useGeolocation";
import { formatAge as formatRelativeTime } from "@/shared/lib/time";
import { Card } from "@/shared/ui";
import { useInspections, useInspectionStats } from "./queries";
import { AlertTriangle, CheckCircle2, Clock, Construction, MapPin, Play, Sparkles } from "lucide-react";

export function InspectorHomeView() {
  const { principal } = useSession();
  const { simulatedOffline } = useOffline();
  const geo = useGeolocation(true);
  const fix = geo.state.status === "ok" ? geo.state.fix : null;
  const coords = fix ? { latitude: fix.latitude, longitude: fix.longitude } : null;
  const accuracy = fix?.accuracy_m ?? 50;
  const geoLoading = geo.state.status === "locating";

  const stats = useInspectionStats();
  const assigned = useInspections("ASSIGNED");
  const inProgress = useInspections("IN_PROGRESS");

  const counts = stats.data?.counts ?? {};
  const assignedCount = counts["ASSIGNED"] ?? 0;
  const inProgressCount = counts["IN_PROGRESS"] ?? 0;
  const completedCount = counts["COMPLETED"] ?? 0;
  const recheckCount = counts["REINSPECTION_REQUIRED"] ?? 0;

  // Active or top priority task
  const activeMission = useMemo(() => {
    if (inProgress.data && inProgress.data.length > 0) {
      return inProgress.data[0];
    }
    if (assigned.data && assigned.data.length > 0) {
      return assigned.data[0];
    }
    return null;
  }, [inProgress.data, assigned.data]);

  const urgentTasks = useMemo(() => {
    const list = [...(inProgress.data ?? []), ...(assigned.data ?? [])];
    return list.slice(0, 5);
  }, [inProgress.data, assigned.data]);

  return (
    <div className="stack" style={{ gap: "1.75rem", maxWidth: "1080px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Hero Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #311042 50%, #4a044e 100%)",
          borderRadius: "16px",
          padding: "1.75rem 2rem",
          color: "#ffffff",
          boxShadow: "0 10px 30px rgba(74, 4, 78, 0.25)",
          border: "1px solid rgba(217, 70, 239, 0.3)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "1.3rem" }}>🔬</span>
                <span
                  style={{
                    background: "rgba(217, 70, 239, 0.25)",
                    border: "1px solid #d946ef",
                    color: "#f5d0fe",
                    padding: "0.2rem 0.65rem",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Senior Road Inspector
                </span>
                {simulatedOffline ? (
                  <span style={{ background: "#dc2626", color: "#fff", padding: "0.2rem 0.5rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700 }}>
                    Offline Mode
                  </span>
                ) : (
                  <span style={{ background: "#059669", color: "#fff", padding: "0.2rem 0.5rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700 }}>
                    Telemetry Live
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: "1.85rem", fontWeight: 800, margin: "0 0 0.4rem 0", color: "#ffffff" }}>
                Road Infrastructure &amp; Damage Intelligence
              </h1>
              <p style={{ color: "#e9d5ff", fontSize: "0.95rem", maxWidth: "680px", margin: 0 }}>
                Welcome back, <strong>{principal?.display_name || "Girish Nongmeikapam"}</strong>. Authoritative on-site damage
                assessment, bridge integrity inspections, and road closure/clearance command across NH-6 &amp; NH-27 lifeline corridors.
              </p>
            </div>

            {/* GPS Telemetry Pill */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.35)",
                backdropFilter: "blur(8px)",
                padding: "0.75rem 1rem",
                borderRadius: "12px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                minWidth: "220px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#d8b4fe", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>
                <MapPin size={14} /> Inspector Coordinates
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#ffffff", marginTop: "0.2rem", fontFamily: "var(--font-mono, monospace)" }}>
                {coords ? `${coords.latitude.toFixed(4)}°N, ${coords.longitude.toFixed(4)}°E` : geoLoading ? "Acquiring GPS..." : "GPS Signal Standby"}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#cbd5e1", marginTop: "0.15rem" }}>
                Accuracy: {accuracy ? `±${Math.round(accuracy)}m` : "Hardware GPS"} · Corridor: NH-6
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
        }}
      >
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="muted small" style={{ fontWeight: 600, textTransform: "uppercase" }}>Assigned Tasks</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "#d97706", marginTop: "0.2rem" }}>
                {assignedCount}
              </div>
            </div>
            <div style={{ background: "#fef3c7", padding: "0.75rem", borderRadius: "12px", color: "#d97706" }}>
              <Clock size={24} />
            </div>
          </div>
          <div className="small muted" style={{ marginTop: "0.4rem" }}>Awaiting arrival / inspection</div>
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="muted small" style={{ fontWeight: 600, textTransform: "uppercase" }}>In Progress</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "#2563eb", marginTop: "0.2rem" }}>
                {inProgressCount}
              </div>
            </div>
            <div style={{ background: "#dbeafe", padding: "0.75rem", borderRadius: "12px", color: "#2563eb" }}>
              <Construction size={24} />
            </div>
          </div>
          <div className="small muted" style={{ marginTop: "0.4rem" }}>Active technical survey underway</div>
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="muted small" style={{ fontWeight: 600, textTransform: "uppercase" }}>Completed</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "#059669", marginTop: "0.2rem" }}>
                {completedCount}
              </div>
            </div>
            <div style={{ background: "#d1fae5", padding: "0.75rem", borderRadius: "12px", color: "#059669" }}>
              <CheckCircle2 size={24} />
            </div>
          </div>
          <div className="small muted" style={{ marginTop: "0.4rem" }}>Decided &amp; impact updated</div>
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="muted small" style={{ fontWeight: 600, textTransform: "uppercase" }}>Recheck Required</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "#dc2626", marginTop: "0.2rem" }}>
                {recheckCount}
              </div>
            </div>
            <div style={{ background: "#fee2e2", padding: "0.75rem", borderRadius: "12px", color: "#dc2626" }}>
              <AlertTriangle size={24} />
            </div>
          </div>
          <div className="small muted" style={{ marginTop: "0.4rem" }}>Monitoring / follow-up check</div>
        </Card>
      </div>

      {/* Active Mission Spotlight */}
      {activeMission && (
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Sparkles size={18} color="#d946ef" />
              <span>Priority Action Dossier · {activeMission.status === "IN_PROGRESS" ? "Currently Inspecting" : "Assigned Mission"}</span>
            </div>
          }
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1.25rem",
              background: "var(--color-surface-sunken, #f8fafc)",
              padding: "1.25rem",
              borderRadius: "12px",
              border: "1px solid var(--color-border, #e2e8f0)",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <span
                  style={{
                    backgroundColor: activeMission.priority === "CRITICAL" ? "#dc2626" : activeMission.priority === "HIGH" ? "#ea580c" : "#0284c7",
                    color: "white",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "0.15rem 0.5rem",
                    borderRadius: "4px",
                  }}
                >
                  {activeMission.priority} PRIORITY
                </span>
                <span className="badge">{activeMission.status}</span>
                {activeMission.candidate_edge_id && (
                  <span className="mono small muted">Corridor: {activeMission.candidate_edge_id}</span>
                )}
              </div>

              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 0.3rem 0" }}>
                {activeMission.instructions || "On-site corridor structural inspection"}
              </h3>
              <p className="small muted" style={{ margin: 0 }}>
                Dispatched {formatRelativeTime(activeMission.created_at)} · Requires physical evidence, passability rating, and authoritative road closure or clearance decision.
              </p>
            </div>

            <Link href={`/inspector/inspections/${activeMission.id}`} className="btn primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Play size={16} /> Open Inspection Dossier
            </Link>
          </div>
        </Card>
      )}

      {/* Priority Assigned Tasks List */}
      <Card
        title="Immediate Assigned &amp; In-Progress Inspections"
        actions={
          <Link href="/inspector/inspections" className="btn small">
            View All ({assignedCount + inProgressCount + completedCount})
          </Link>
        }
      >
        {urgentTasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
            <span style={{ fontSize: "2.5rem" }}>🎉</span>
            <h4 style={{ fontWeight: 700, margin: "0.5rem 0 0.2rem 0" }}>No Pending Inspections</h4>
            <p className="muted small">All assigned corridor tasks have been verified and processed. Highway network clear.</p>
          </div>
        ) : (
          <div className="stack" style={{ gap: "0.75rem" }}>
            {urgentTasks.map((insp) => (
              <div
                key={insp.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.85rem 1.1rem",
                  borderRadius: "10px",
                  background: "var(--color-surface, #ffffff)",
                  border: "1px solid var(--color-border, #e2e8f0)",
                  transition: "all 0.15s ease",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "0.1rem 0.4rem",
                        borderRadius: "4px",
                        backgroundColor: insp.priority === "CRITICAL" ? "#fee2e2" : insp.priority === "HIGH" ? "#ffedd5" : "#e0f2fe",
                        color: insp.priority === "CRITICAL" ? "#991b1b" : insp.priority === "HIGH" ? "#9a3412" : "#075985",
                      }}
                    >
                      {insp.priority}
                    </span>
                    <span className="small font-bold" style={{ fontWeight: 700 }}>
                      {insp.candidate_edge_id ? `Corridor: ${insp.candidate_edge_id}` : "Report Inspection"}
                    </span>
                    <span className="badge small">{insp.status}</span>
                  </div>
                  <div className="small text-secondary" style={{ maxWidth: "550px" }}>
                    {insp.instructions || "Conduct visual check, measure obstruction width/depth, and verify traversability."}
                  </div>
                </div>

                <Link href={`/inspector/inspections/${insp.id}`} className="btn small">
                  Evaluate &rarr;
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Quick Navigation Panels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        <Card title="Ground Patrol Reports">
          <p className="small muted">
            Review raw field observations submitted by patrolling officers along NH-6 / NH-27. Unreviewed reports in provisional caution state.
          </p>
          <div style={{ marginTop: "1rem" }}>
            <Link href="/inspector/reports" className="btn small secondary">
              Browse Patrol Reports &rarr;
            </Link>
          </div>
        </Card>

        <Card title="Corridor Health &amp; Bridges">
          <p className="small muted">
            Inspect the live traversability status and structural maintenance history of critical mountain bridges, culverts, and cuttings.
          </p>
          <div style={{ marginTop: "1rem" }}>
            <Link href="/inspector/road-assessment" className="btn small secondary">
              Open Road Assessment &rarr;
            </Link>
          </div>
        </Card>

        <Card title="Offline Sync &amp; Evidence Queue">
          <p className="small muted">
            Manage offline inspection dossiers, queued sync batches, and local photo caching when operating in remote gorge shadow zones.
          </p>
          <div style={{ marginTop: "1rem" }}>
            <Link href="/inspector/queue" className="btn small secondary">
              View Sync Queue &rarr;
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
