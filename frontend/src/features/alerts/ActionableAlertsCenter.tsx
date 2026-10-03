"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useScopeFilter } from "@/shared/auth";
import { formatAge } from "@/shared/lib/time";
import { useNow } from "@/shared/lib/useNow";

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM";
export type AlertCategory = "ROAD" | "LOGISTICS" | "FACILITY" | "SLA";

export interface ActionableAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  subtitle: string;
  timestamp: string; // ISO string
  actionLabel: string;
  actionHref: string;
  // Deep detail fields
  whyGenerated: string;
  whatIsAffected: string;
  recommendedAction: string;
  relatedIncidentId?: string;
  relatedIncidentTitle?: string;
  relatedTripCode?: string;
  relatedFacilityName?: string;
  isAcknowledged?: boolean;
}

const ACTIONABLE_ALERTS_ROSTER: ActionableAlert[] = [
  {
    id: "alert-nh27-nagaon-subm",
    severity: "CRITICAL",
    category: "ROAD",
    title: "NH-27 Nagaon-Jorhat Bypass Submerged",
    subtitle: "Kopili River flash flood breach · High-speed freight corridor closed",
    timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    actionLabel: "View Route",
    actionHref: "/gov/map",
    whyGenerated: "Brahmaputra/Kopili tributary overflow breached 200m section of NH-27 at KM 82.4. Water depth over tarmac: 0.85m.",
    whatIsAffected: "Assam State primary East-West economic spine connecting Guwahati to Upper Assam (Jorhat, Dibrugarh, Tinsukia); 14 freight trucks halted.",
    recommendedAction: "Issue State Traffic Advisory diverting convoys via NH-715 Tezpur-North Bank route; mobilize Assam PWD sandbag berm team.",
    relatedIncidentId: "INC-2026-004",
    relatedIncidentTitle: "Nagaon Highway Submersion",
    relatedFacilityName: "Gauhati Medical College",
    relatedTripCode: "TR-208",
  },
  {
    id: "alert-shg-hosp",
    severity: "CRITICAL",
    category: "FACILITY",
    title: "Civil Hospital Shillong",
    subtitle: "No feasible road access · All approach corridors obstructed",
    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    actionLabel: "View Impact",
    actionHref: "/gov/impact",
    whyGenerated: "Continuous structural debris and twin-lane blockage at Sonapur KM 12.4 severed primary NH-6 access with no heavy-vehicle bypass within 45 km.",
    whatIsAffected: "Civil Hospital Shillong (180 critical inpatients, ICU oxygen reserve down to 18 hours), 3 inbound emergency convoys.",
    recommendedAction: "Activate Emergency Coordination SOP-4; request immediate Indian Air Force helicopter medical airdrop from Upper Shillong ALG; deploy BRO Quick-Clearing Taskforce.",
    relatedIncidentId: "INC-2026-001",
    relatedIncidentTitle: "Sonapur NH-6 Major Landslide",
    relatedFacilityName: "Civil Hospital Shillong",
    relatedTripCode: "TR-208",
  },
  {
    id: "alert-sla-tier1",
    severity: "HIGH",
    category: "SLA",
    title: "12 Tier-1 Deliveries at Risk",
    subtitle: "Projected SLA breach within 90 minutes across Meghalaya & Manipur",
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    actionLabel: "View Deliveries",
    actionHref: "/gov/fleet/deliveries",
    whyGenerated: "Corridor choke points on NH-6 and NH-29 delayed 4 refrigerated pharma vans and 8 oxygen cylinder haulers beyond their safe delivery thresholds.",
    whatIsAffected: "12 Tier-1 Life-Saving Consignments including pediatric cold-chain vaccines (VAC-NPH-2026-002) and dialysis concentrates.",
    recommendedAction: "Re-prioritize highway clearance escorts; authorize priority green-corridor passage through secondary border checkposts; notify recipient CMOs of delayed ETA (+45m).",
    relatedTripCode: "TR-211",
    relatedFacilityName: "Imphal Regional Medical Hub",
  },
  {
    id: "alert-nh6-blocked",
    severity: "HIGH",
    category: "ROAD",
    title: "NH-6 Sonapur Blocked",
    subtitle: "7 active trips halted or delayed in mudslide sector",
    timestamp: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    actionLabel: "View Route",
    actionHref: "/gov/routes?originLat=26.1450&originLon=91.7350&destinationLat=25.5780&destinationLon=91.8840",
    whyGenerated: "Telemetry anomaly: 7 commercial vehicles registered 0 km/h for >40 minutes at coordinates 25.9610°N, 91.8828°E following 140mm rainfall burst.",
    whatIsAffected: "National Highway 6 lifeline connecting Assam, Meghalaya, Barak Valley, and Tripura; 7 logistics convoys halted.",
    recommendedAction: "Issue Regional Route Diversion Advisory via Umiam-Ribhoi rural bypass for vehicles <7.5 tons; halt heavy multi-axle freight at Jorabat staging yard.",
    relatedIncidentId: "INC-2026-001",
    relatedIncidentTitle: "Sonapur NH-6 Major Landslide",
    relatedTripCode: "TR-208",
  },
  {
    id: "alert-banderdewa-bridge",
    severity: "CRITICAL",
    category: "ROAD",
    title: "Banderdewa Bridge Collapse Risk",
    subtitle: "Flash flood scour detected · Twin-lane traffic restricted to 5 km/h",
    timestamp: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    actionLabel: "View Impact",
    actionHref: "/gov/impact",
    whyGenerated: "Sub-surface pier sensor alert: flood scour depth exceeded 1.8m threshold on Dikrong River crossing on NH-415.",
    whatIsAffected: "NH-415 lifeline connecting Tezpur to Itanagar; vital fuel tankers and emergency supplies into Arunachal Pradesh.",
    recommendedAction: "Suspend multi-axle heavy vehicle crossings immediately; divert heavy convoys through Hollongi bypass; request PWD structural integrity scan.",
    relatedFacilityName: "Itanagar General Hospital",
    relatedTripCode: "TR-219",
  },
  {
    id: "alert-tuensang-fuel",
    severity: "HIGH",
    category: "LOGISTICS",
    title: "Tuensang Emergency Power Shortage",
    subtitle: "Generator diesel stock <24h reserve · Fuel tanker NL-01 stalled",
    timestamp: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    actionLabel: "View Fleet",
    actionHref: "/gov/fleet",
    whyGenerated: "Trip TR-112 carrying heavy generator fuel and bridge equipment disrupted by rockfall on Mokokchung-Tuensang Highway.",
    whatIsAffected: "Tuensang District Emergency Operations Center and cold-storage blood bank backup power.",
    recommendedAction: "Dispatch small 4x4 pickup shuttle tanks from Mokokchung staging facility; expedite rock clearance at Chare Ridge KM 48.",
    relatedTripCode: "TR-112",
    relatedFacilityName: "Tuensang Disaster Zone",
  },
  {
    id: "alert-tripura-offline",
    severity: "MEDIUM",
    category: "LOGISTICS",
    title: "Tripura Convoy Telemetry Offline",
    subtitle: "Vehicle TR-01-CV-6632 no GPS ping for 42 minutes",
    timestamp: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    actionLabel: "View Fleet",
    actionHref: "/gov/fleet",
    whyGenerated: "Cellular blackspot along Atharamura hill section on NH-8; keep-alive packets failed 8 consecutive cycles.",
    whatIsAffected: "Dry ration consignment REL-RSN-2026-003 en route to Agartala Central Relief Hub.",
    recommendedAction: "Query nearest police checkpost at Teliamura for physical confirmation; verify driver satellite phone link.",
    relatedTripCode: "TR-620",
    relatedFacilityName: "Agartala Central Relief Hub",
  },
];

export function ActionableAlertsCenter() {
  const { isStateAuthority, isDistrictOfficer, assignedState, assignedDistrict } = useScopeFilter();
  const [scopeActive, setScopeActive] = useState<boolean>(isDistrictOfficer || isStateAuthority);
  const now = useNow(30_000);

  const [activeFilter, setActiveFilter] = useState<"ALL" | "CRITICAL" | "HIGH" | "ROAD" | "LOGISTICS" | "FACILITY" | "SLA">("ALL");
  const [selectedAlertId, setSelectedAlertId] = useState<string>("alert-nh27-nagaon-subm");
  const [acknowledgedIds, setAcknowledgedIds] = useState<Record<string, boolean>>({});

  // Scoped alerts (filtered by District Officer or State Authority if active)
  const scopedAlerts = useMemo(() => {
    if (!scopeActive) return ACTIONABLE_ALERTS_ROSTER;
    return ACTIONABLE_ALERTS_ROSTER.filter((a) => {
      const text = `${a.title} ${a.subtitle} ${a.whyGenerated} ${a.whatIsAffected} ${a.relatedFacilityName || ""}`.toLowerCase();
      if (isDistrictOfficer) {
        return (
          text.includes("kamrup") ||
          text.includes("guwahati") ||
          text.includes("nagaon") ||
          text.includes("sonapur") ||
          text.includes("nh-27") ||
          text.includes("nh-6") ||
          text.includes("shillong") ||
          text.includes("dispur") ||
          text.includes("jalukbari") ||
          text.includes("azara")
        );
      }
      return (
        text.includes("assam") ||
        text.includes("guwahati") ||
        text.includes("nagaon") ||
        text.includes("sonapur") ||
        text.includes("nh-27") ||
        text.includes("nh-6") ||
        text.includes("shillong") ||
        text.includes("tezpur")
      );
    });
  }, [scopeActive, isDistrictOfficer]);

  // Filter logic
  const filteredAlerts = useMemo(() => {
    return scopedAlerts.filter((alert) => {
      if (activeFilter === "ALL") return true;
      if (activeFilter === "CRITICAL" || activeFilter === "HIGH") {
        return alert.severity === activeFilter;
      }
      return alert.category === activeFilter;
    });
  }, [scopedAlerts, activeFilter]);

  // Selected alert details
  const selectedAlert = useMemo(() => {
    return scopedAlerts.find((a) => a.id === selectedAlertId) ?? scopedAlerts[0] ?? ACTIONABLE_ALERTS_ROSTER[0];
  }, [scopedAlerts, selectedAlertId]);

  const toggleAcknowledge = (id: string) => {
    setAcknowledgedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const criticalCount = scopedAlerts.filter((a) => a.severity === "CRITICAL").length;
  const highCount = scopedAlerts.filter((a) => a.severity === "HIGH").length;

  return (
    <div className="stack" style={{ gap: "1.5rem", paddingBottom: "3rem" }}>
      {/* District Officer Active Jurisdiction Banner */}
      {isDistrictOfficer && (
        <div
          style={{
            background: "linear-gradient(90deg, #064e3b 0%, #065f46 100%)",
            color: "#ffffff",
            padding: "0.85rem 1.25rem",
            borderRadius: "12px",
            border: "1px solid #10b981",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 15px rgba(16, 185, 129, 0.15)",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>📋 District Incident Verifier Active · {assignedDistrict} Emergency Alerts Command</span>
              <span style={{ background: "#10b981", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                Kamrup Metro Alerts
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#a7f3d0", marginTop: "0.2rem" }}>
              Actionable warnings and incident escalation are scoped to {assignedDistrict} circle routes and critical facilities.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setScopeActive(!scopeActive)}
              style={{
                background: scopeActive ? "#10b981" : "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.35rem 0.75rem",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              {scopeActive ? `✓ Focused on ${assignedDistrict}` : "Show Full NER Region"}
            </button>
          </div>
        </div>
      )}

      {/* State Authority Active Jurisdiction Banner */}
      {isStateAuthority && !isDistrictOfficer && (
        <div
          style={{
            background: "linear-gradient(90deg, #091e3a 0%, #1e3a5f 100%)",
            color: "#ffffff",
            padding: "0.85rem 1.25rem",
            borderRadius: "12px",
            border: "1px solid #0284c7",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 15px rgba(2, 132, 199, 0.15)",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>🏛️ State Authority Active · {assignedState} Emergency Alerts Command</span>
              <span style={{ background: "#0284c7", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                Assam Alerts
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
              Actionable warnings and incident escalation are scoped to {assignedState} state highways and lifeline routes.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setScopeActive(!scopeActive)}
              style={{
                background: scopeActive ? "#0284c7" : "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.35rem 0.75rem",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              {scopeActive ? `✓ Focused on ${assignedState}` : "Show Full NER Region"}
            </button>
          </div>
        </div>
      )}

      {/* Top Banner / Pulse Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #311042 50%, #450a0a 100%)",
          color: "#ffffff",
          padding: "1.5rem 1.75rem",
          borderRadius: "16px",
          boxShadow: "0 10px 30px -5px rgba(220, 38, 38, 0.25)",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "1.4rem" }}>🔔</span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: "rgba(239, 68, 68, 0.25)",
                color: "#fca5a5",
                padding: "0.2rem 0.6rem",
                borderRadius: "999px",
                border: "1px solid rgba(239, 68, 68, 0.4)",
              }}
            >
              Actionable Intelligence Feed
            </span>
          </div>
          <h1 style={{ fontSize: "1.65rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            {isDistrictOfficer
              ? `District Operational Alerts — ${assignedDistrict}`
              : isStateAuthority
              ? `State Operational Alerts — ${assignedState}`
              : "Operational Alerts Command"}
          </h1>
          <p style={{ margin: "0.35rem 0 0", color: "#cbd5e1", fontSize: "0.92rem", maxWidth: "680px" }}>
            {isDistrictOfficer
              ? `Kamrup Metropolitan District Administration · District Incident Verifier Scope. High-priority corridor obstructions and facility isolation alerts for ${assignedDistrict}.`
              : isStateAuthority
              ? `Assam State Department of Transport · State Authority Scope. High-priority corridor obstructions and facility isolation alerts for ${assignedState}.`
              : "High-priority operational warnings derived from verified road obstructions, facility isolations, and projected delivery SLA breaches."}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div
            style={{
              background: "rgba(239, 68, 68, 0.2)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              padding: "0.6rem 1rem",
              borderRadius: "12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#f87171" }}>{criticalCount}</div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#fca5a5", textTransform: "uppercase" }}>
              Critical Alerts
            </div>
          </div>
          <div
            style={{
              background: "rgba(245, 158, 11, 0.2)",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              padding: "0.6rem 1rem",
              borderRadius: "12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fbbf24" }}>{highCount}</div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#fde68a", textTransform: "uppercase" }}>
              High Priority
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs Bar (All, Critical, High, Road, Logistics, Facility, SLA) */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          overflowX: "auto",
          paddingBottom: "0.25rem",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", marginRight: "0.25rem" }}>
          Filter by:
        </span>
        {[
          { id: "ALL", label: "All Alerts" },
          { id: "CRITICAL", label: "🔴 Critical" },
          { id: "HIGH", label: "🟠 High" },
          { id: "ROAD", label: "🛣️ Road Disruptions" },
          { id: "LOGISTICS", label: "🚚 Logistics & Fleet" },
          { id: "FACILITY", label: "🏥 Facility Isolation" },
          { id: "SLA", label: "⏱️ Delivery SLA Breach" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id as typeof activeFilter)}
            style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              padding: "0.45rem 0.9rem",
              borderRadius: "8px",
              border: activeFilter === tab.id ? "1px solid #0284c7" : "1px solid var(--border)",
              background: activeFilter === tab.id ? "#0284c7" : "var(--surface)",
              color: activeFilter === tab.id ? "#ffffff" : "var(--text)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: "var(--shadow-sm)",
              transition: "all 0.15s ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Split Workspace: Left Alert Cards List + Right Alert Detail Inspector (Everbridge style) */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(360px, 1fr)", gap: "1.5rem", alignItems: "start" }}>
        {/* Left Column: Actionable Alert Cards */}
        <div className="stack" style={{ gap: "1rem" }}>
          {filteredAlerts.length === 0 ? (
            <div
              style={{
                background: "var(--surface)",
                padding: "2.5rem",
                borderRadius: "14px",
                border: "1px solid var(--border)",
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              No alerts match the selected filter.
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              const isSelected = selectedAlertId === alert.id;
              const isAck = acknowledgedIds[alert.id];
              const isCrit = alert.severity === "CRITICAL";

              return (
                <div
                  key={alert.id}
                  onClick={() => setSelectedAlertId(alert.id)}
                  style={{
                    background: "var(--surface)",
                    borderRadius: "14px",
                    border: isSelected
                      ? isCrit
                        ? "2px solid #ef4444"
                        : "2px solid #f59e0b"
                      : "1px solid var(--border)",
                    boxShadow: isSelected ? "0 8px 24px rgba(0, 0, 0, 0.08)" : "var(--shadow-sm)",
                    padding: "1.2rem 1.35rem",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Left severity indicator stripe */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: "6px",
                      background: isCrit ? "#ef4444" : alert.severity === "HIGH" ? "#f59e0b" : "#3b82f6",
                    }}
                  />

                  {/* Header Row: Severity Pill + Category + Timestamp */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          textTransform: "uppercase",
                          padding: "0.2rem 0.55rem",
                          borderRadius: "6px",
                          background: isCrit ? "#fee2e2" : "#fef3c7",
                          color: isCrit ? "#991b1b" : "#92400e",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <span>{isCrit ? "🔴" : "🟠"}</span>
                        {alert.severity}
                      </span>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          background: "var(--surface-2)",
                          color: "var(--text-muted)",
                          padding: "0.2rem 0.45rem",
                          borderRadius: "4px",
                        }}
                      >
                        {alert.category}
                      </span>
                      {isAck && (
                        <span style={{ fontSize: "0.7rem", color: "#166534", background: "#dcfce7", padding: "0.15rem 0.4rem", borderRadius: "4px", fontWeight: 700 }}>
                          ✓ Acknowledged
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {formatAge(alert.timestamp, now)}
                    </span>
                  </div>

                  {/* Title & Subtitle */}
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0.2rem 0 0.3rem", color: "var(--text)" }}>
                    {alert.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.88rem", color: isCrit ? "#b91c1c" : "#b45309", fontWeight: 500 }}>
                    {alert.subtitle}
                  </p>

                  {/* Bottom Action Footer */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: "1rem",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Tap to inspect causal chain
                    </span>

                    <div style={{ display: "flex", gap: "0.6rem" }}>
                      <Link
                        href={alert.actionHref}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          background: isCrit ? "#ef4444" : "#0284c7",
                          color: "#ffffff",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          padding: "0.4rem 0.85rem",
                          borderRadius: "8px",
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                        }}
                      >
                        [{alert.actionLabel}]
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Alert Detail Inspector (The 6-Step Breakdown Requested) */}
        <div style={{ position: "sticky", top: "1rem" }}>
          {selectedAlert ? (
            <div
              style={{
                background: "var(--surface)",
                borderRadius: "16px",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-md)",
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div
                style={{
                  background:
                    selectedAlert.severity === "CRITICAL"
                      ? "linear-gradient(135deg, #7f1d1d, #991b1b)"
                      : "linear-gradient(135deg, #78350f, #92400e)",
                  color: "#ffffff",
                  padding: "1.25rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "rgba(255, 255, 255, 0.2)",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "6px",
                    }}
                  >
                    {selectedAlert.severity} ALERT · {selectedAlert.category}
                  </span>
                  <span style={{ fontSize: "0.75rem", opacity: 0.9 }}>
                    Generated {formatAge(selectedAlert.timestamp, now)}
                  </span>
                </div>
                <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0.5rem 0 0.2rem" }}>
                  {selectedAlert.title}
                </h2>
                <div style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.85)" }}>
                  {selectedAlert.subtitle}
                </div>
              </div>

              {/* 6-Step Inspection Dossier Requested by User */}
              <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                {/* 1. Why generated? */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
                    Why Generated?
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "0.85rem", lineHeight: 1.45 }}>
                    {selectedAlert.whyGenerated}
                  </div>
                </div>

                {/* 2. What is affected? */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
                    What is Affected?
                  </div>
                  <div style={{ background: "#fef2f2", padding: "0.75rem", borderRadius: "8px", border: "1px solid #fecaca", color: "#991b1b", fontSize: "0.85rem", lineHeight: 1.45 }}>
                    {selectedAlert.whatIsAffected}
                  </div>
                </div>

                {/* 3. Recommended action */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
                    Recommended Action (Commander Guidance)
                  </div>
                  <div style={{ background: "#f0fdf4", padding: "0.75rem", borderRadius: "8px", border: "1px solid #bbf7d0", color: "#166534", fontSize: "0.85rem", lineHeight: 1.45 }}>
                    💡 <strong>Protocol:</strong> {selectedAlert.recommendedAction}
                  </div>
                </div>

                {/* 4. Related Incident & 5. Related Trip/Facility */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                  <div style={{ background: "var(--surface-2)", padding: "0.65rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 700 }}>Related Incident</div>
                    {selectedAlert.relatedIncidentId ? (
                      <Link
                        href={`/gov/incidents`}
                        style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0284c7", textDecoration: "none" }}
                      >
                        {selectedAlert.relatedIncidentTitle ?? selectedAlert.relatedIncidentId} →
                      </Link>
                    ) : (
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>None (SLA/Telemetry)</span>
                    )}
                  </div>

                  <div style={{ background: "var(--surface-2)", padding: "0.65rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 700 }}>Related Trip / Facility</div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                      {selectedAlert.relatedTripCode ?? selectedAlert.relatedFacilityName ?? "Multiple Assets"}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.5rem" }}>
                  <Link
                    href={selectedAlert.actionHref}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      background: selectedAlert.severity === "CRITICAL" ? "#dc2626" : "#0284c7",
                      color: "#ffffff",
                      padding: "0.65rem",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      textDecoration: "none",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    }}
                  >
                    Execute: {selectedAlert.actionLabel} →
                  </Link>

                  <button
                    type="button"
                    onClick={() => toggleAcknowledge(selectedAlert.id)}
                    style={{
                      background: acknowledgedIds[selectedAlert.id] ? "#dcfce7" : "var(--surface-2)",
                      color: acknowledgedIds[selectedAlert.id] ? "#166534" : "var(--text)",
                      border: "1px solid var(--border)",
                      padding: "0.65rem 0.9rem",
                      borderRadius: "8px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {acknowledgedIds[selectedAlert.id] ? "✓ Acknowledged" : "Acknowledge"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: "var(--surface)",
                padding: "2rem",
                borderRadius: "16px",
                border: "1px solid var(--border)",
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              Select any alert from the left feed to inspect its operational cause and recommended action.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
