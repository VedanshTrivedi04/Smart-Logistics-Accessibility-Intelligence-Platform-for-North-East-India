"use client";

import { useMemo, useState } from "react";
import { useScopeFilter } from "@/shared/auth";
import { downloadText, toCsv } from "@/shared/lib/format";

export interface StateOperationalRecord {
  state: string;
  incidents: number;
  trips: number;
  delays: number;
  avgClearance: string;
  vulnerability: "High" | "Moderate" | "Low";
  vulnerabilityColor: string;
}

const STATE_OPERATIONAL_DATA: StateOperationalRecord[] = [
  { state: "Assam", incidents: 4, trips: 21, delays: 3, avgClearance: "3.1 hrs", vulnerability: "Moderate", vulnerabilityColor: "#f59e0b" },
  { state: "Meghalaya", incidents: 6, trips: 18, delays: 7, avgClearance: "5.4 hrs", vulnerability: "High", vulnerabilityColor: "#ef4444" },
  { state: "Manipur", incidents: 2, trips: 11, delays: 2, avgClearance: "4.8 hrs", vulnerability: "High", vulnerabilityColor: "#ef4444" },
  { state: "Arunachal Pradesh", incidents: 3, trips: 14, delays: 1, avgClearance: "6.2 hrs", vulnerability: "Moderate", vulnerabilityColor: "#f59e0b" },
  { state: "Nagaland", incidents: 5, trips: 12, delays: 4, avgClearance: "4.1 hrs", vulnerability: "High", vulnerabilityColor: "#ef4444" },
  { state: "Mizoram", incidents: 2, trips: 9, delays: 2, avgClearance: "3.9 hrs", vulnerability: "Moderate", vulnerabilityColor: "#f59e0b" },
  { state: "Tripura", incidents: 1, trips: 8, delays: 1, avgClearance: "2.5 hrs", vulnerability: "Low", vulnerabilityColor: "#10b981" },
  { state: "Sikkim", incidents: 2, trips: 10, delays: 1, avgClearance: "5.8 hrs", vulnerability: "Moderate", vulnerabilityColor: "#f59e0b" },
];

export interface CircleOperationalRecord {
  circle: string;
  headquarters: string;
  incidents: number;
  trips: number;
  delays: number;
  avgClearance: string;
  vulnerability: "High" | "Moderate" | "Low";
  vulnerabilityColor: string;
}

const DISTRICT_CIRCLES_DATA: CircleOperationalRecord[] = [
  { circle: "Guwahati Urban Circle", headquarters: "Panbazar / Paltan Bazar", incidents: 2, trips: 14, delays: 1, avgClearance: "1.8 hrs", vulnerability: "Low", vulnerabilityColor: "#10b981" },
  { circle: "Dispur Capital Circle", headquarters: "Dispur Secretariat / Supermarket", incidents: 1, trips: 12, delays: 0, avgClearance: "1.4 hrs", vulnerability: "Low", vulnerabilityColor: "#10b981" },
  { circle: "Azara Airport Circle", headquarters: "Borjhar LGBI Corridor", incidents: 1, trips: 8, delays: 1, avgClearance: "2.4 hrs", vulnerability: "Moderate", vulnerabilityColor: "#f59e0b" },
  { circle: "Sonapur Frontier Circle", headquarters: "Sonapur / Jorabat Border Ridge", incidents: 3, trips: 9, delays: 4, avgClearance: "4.8 hrs", vulnerability: "High", vulnerabilityColor: "#ef4444" },
  { circle: "North Guwahati Saraighat", headquarters: "Amingaon / Saraighat North", incidents: 1, trips: 10, delays: 1, avgClearance: "2.9 hrs", vulnerability: "Moderate", vulnerabilityColor: "#f59e0b" },
  { circle: "Chandrapur Riverine Circle", headquarters: "Chandrapur Ghat Defile", incidents: 0, trips: 4, delays: 0, avgClearance: "2.1 hrs", vulnerability: "Low", vulnerabilityColor: "#10b981" },
];

const MONTHLY_INCIDENTS = [
  { month: "Jan", count: 14, label: "███", pct: 28 },
  { month: "Feb", count: 22, label: "█████", pct: 44 },
  { month: "Mar", count: 38, label: "████████", pct: 76 },
  { month: "Apr", count: 19, label: "████", pct: 38 },
  { month: "May", count: 42, label: "█████████", pct: 84 },
  { month: "Jun (Monsoon Peak)", count: 50, label: "██████████", pct: 100 },
];

const HAZARD_TYPE_BREAKDOWN = [
  { type: "Debris & Rock Landslide", count: 72, pct: 48, color: "#ef4444" },
  { type: "Flash Flood & Waterlogging", count: 39, pct: 26, color: "#3b82f6" },
  { type: "Highway Structural Damage", count: 24, pct: 16, color: "#f59e0b" },
  { type: "Bridge & Culvert Impairment", count: 15, pct: 10, color: "#8b5cf6" },
];

export function AnalyticsCommandCenter() {
  const { isStateAuthority, isDistrictOfficer, assignedState, assignedDistrict } = useScopeFilter();
  const [scopeActive, setScopeActive] = useState<boolean>(isDistrictOfficer || isStateAuthority);
  const [period, setPeriod] = useState<"30D" | "QUARTER" | "YTD" | "ANNUAL">("QUARTER");
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  // Section 2: Road Disruptions KPIs
  const roadKpis = useMemo(() => ({
    blocked: isDistrictOfficer ? 3 : 18,
    restricted: isDistrictOfficer ? 6 : 34,
    resolved: isDistrictOfficer ? 19 : 62,
    avgResolutionTime: isDistrictOfficer ? "2.6 Hours" : "4.2 Hours",
    clearingTrend: isDistrictOfficer ? "22% faster clearance in Kamrup Metro" : "14% faster than previous quarter",
  }), [isDistrictOfficer]);

  // Section 3: Logistics KPIs
  const logisticsKpis = useMemo(() => ({
    totalTrips: isDistrictOfficer ? 38 : 128,
    delayedTrips: isDistrictOfficer ? 4 : 24,
    delayPct: isDistrictOfficer ? "10.5%" : "18.7%",
    slaBreaches: isDistrictOfficer ? 1 : 6,
    breachPct: isDistrictOfficer ? "2.6%" : "4.6%",
    averageDelay: isDistrictOfficer ? "22 mins" : "38 mins",
  }), [isDistrictOfficer]);

  // CSV Export Handler
  const handleExportCsv = () => {
    if (isDistrictOfficer && scopeActive) {
      const headers = ["Circle", "Headquarters", "Incidents", "Trips", "Delays", "Avg_Clearance", "Vulnerability"];
      const rows = DISTRICT_CIRCLES_DATA.map((c) => [c.circle, c.headquarters, c.incidents, c.trips, c.delays, c.avgClearance, c.vulnerability]);
      downloadText(`${assignedDistrict}_Circles_Analytics_Report.csv`, toCsv(headers, rows));
      return;
    }
    const headers = ["State", "Incidents", "Total_Trips", "Delayed_Trips", "Avg_Clearance_Time", "Vulnerability_Tier"];
    const rows = STATE_OPERATIONAL_DATA.map((s) => [
      s.state,
      s.incidents,
      s.trips,
      s.delays,
      s.avgClearance,
      s.vulnerability,
    ]);
    downloadText("NER_State_Operational_Analytics_Report.csv", toCsv(headers, rows));
  };

  // PDF / Print Handler
  const handleExportPdf = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="stack" style={{ gap: "2rem", paddingBottom: "4rem" }}>
      {/* District Officer Scoped Banner */}
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
              <span>📋 District Incident Verifier Active · {assignedDistrict} Operational Analytics</span>
              <span style={{ background: "#10b981", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                Kamrup Metro Sub-Divisions
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#a7f3d0", marginTop: "0.2rem" }}>
              Sub-division incident recurrence, circle clearance velocities, and arterial resilience are spotlighted for {assignedDistrict}.
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

      {/* State Authority Scoped Banner */}
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
              <span>🏛️ State Authority Active · {assignedState} Operational Analytics Command</span>
              <span style={{ background: "#0284c7", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                Assam Scope
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
              Historical incident trends, clearance velocities, and SLA resilience are spotlighted for {assignedState}.
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

      {/* Top Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #091e3a 0%, #0f2b48 50%, #1e293b 100%)",
          color: "#ffffff",
          padding: "1.6rem 1.75rem",
          borderRadius: "16px",
          boxShadow: "0 10px 30px -5px rgba(2, 132, 199, 0.2)",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "1.4rem" }}>📊</span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: "rgba(56, 189, 248, 0.2)",
                color: "#38bdf8",
                padding: "0.2rem 0.6rem",
                borderRadius: "999px",
                border: "1px solid rgba(56, 189, 248, 0.3)",
              }}
            >
              Historical & Analytical Intelligence
            </span>
          </div>
          <h1 style={{ fontSize: "1.65rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            {isDistrictOfficer
              ? `District Historical Analytics & Reports — ${assignedDistrict}`
              : isStateAuthority
              ? `State Historical Analytics & Reports — ${assignedState}`
              : "Regional Operations Analytics & Reports"}
          </h1>
          <p style={{ margin: "0.35rem 0 0", color: "#94a3b8", fontSize: "0.92rem", maxWidth: "700px" }}>
            {isDistrictOfficer
              ? `Kamrup Metropolitan District Administration · District Incident Verifier Scope. Historical incident recurrence, sub-division clearance velocities, and logistics SLA reliability within ${assignedDistrict}.`
              : isStateAuthority
              ? `Assam State Department of Transport · State Authority Scope. Historical incident recurrence, highway clearance velocity, and logistics SLA reliability within ${assignedState}.`
              : "Comprehensive performance retrospectives answering: \"Past mein kya hua aur operational performance kaisi rahi?\""}
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div style={{ display: "flex", background: "rgba(255, 255, 255, 0.08)", padding: "0.3rem", borderRadius: "10px", gap: "0.25rem" }}>
          {[
            { id: "30D", label: "Last 30 Days" },
            { id: "QUARTER", label: "Monsoon Quarter" },
            { id: "YTD", label: "Year-to-Date" },
            { id: "ANNUAL", label: "Annual Record" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPeriod(tab.id as typeof period)}
              style={{
                background: period === tab.id ? "#0284c7" : "transparent",
                color: period === tab.id ? "#ffffff" : "#cbd5e1",
                border: "none",
                borderRadius: "7px",
                padding: "0.45rem 0.8rem",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section 1 — Incident Trends */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0284c7", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Section 1
            </span>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0.2rem 0 0" }}>
              Hazard & Incident Occurrence Trends
            </h2>
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Total recorded events: 150</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: "1.75rem" }}>
          {/* Monthly Bar Chart */}
          <div style={{ background: "var(--surface-2)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 1rem" }}>
              Incidents Over Time (Monthly Progression)
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {MONTHLY_INCIDENTS.map((item) => (
                <div key={item.month}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    <span>{item.month}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {item.count} incidents <span style={{ fontFamily: "monospace", color: "#0284c7" }}>{item.label}</span>
                    </span>
                  </div>
                  <div style={{ height: "10px", background: "var(--border)", borderRadius: "999px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${item.pct}%`,
                        background: item.count > 30 ? "linear-gradient(90deg, #f59e0b, #ef4444)" : "#0284c7",
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hazard Breakdown */}
          <div style={{ background: "var(--surface-2)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 1rem" }}>
              Hazard Classification Breakdown
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {HAZARD_TYPE_BREAKDOWN.map((h) => (
                <div key={h.type}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                    <span>{h.type}</span>
                    <span>{h.count} cases ({h.pct}%)</span>
                  </div>
                  <div style={{ height: "8px", background: "var(--border)", borderRadius: "999px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${h.pct}%`, background: h.color, borderRadius: "999px" }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "1.25rem", fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
              * Landslides along National Highway corridors remain the single largest cause of arterial downtime across the Northeast region.
            </div>
          </div>
        </div>
      </div>

      {/* Section 2 — Road Disruptions */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          padding: "1.5rem",
        }}
      >
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0284c7", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Section 2
        </span>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0.2rem 0 1.25rem" }}>
          Highway Network & Road Disruption Metrics
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          {/* Blocked */}
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "14px", padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#991b1b", textTransform: "uppercase" }}>
              Blocked Corridors
            </div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#dc2626", marginTop: "0.35rem" }}>
              {roadKpis.blocked}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#991b1b", marginTop: "0.2rem" }}>
              Severe obstruction · Heavy debris
            </div>
          </div>

          {/* Restricted */}
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "14px", padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#92400e", textTransform: "uppercase" }}>
              Restricted Roads
            </div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#d97706", marginTop: "0.35rem" }}>
              {roadKpis.restricted}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#92400e", marginTop: "0.2rem" }}>
              Single-lane or speed restricted
            </div>
          </div>

          {/* Resolved */}
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "14px", padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>
              Resolved & Cleared
            </div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#16a34a", marginTop: "0.35rem" }}>
              {roadKpis.resolved}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#166534", marginTop: "0.2rem" }}>
              Fully reopened to commercial transit
            </div>
          </div>

          {/* Average Resolution Time */}
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "14px", padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e40af", textTransform: "uppercase" }}>
              Average Resolution Time
            </div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#0284c7", marginTop: "0.35rem" }}>
              {roadKpis.avgResolutionTime}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#1e40af", marginTop: "0.2rem" }}>
              {roadKpis.clearingTrend}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3 — Logistics Performance */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          padding: "1.5rem",
        }}
      >
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0284c7", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Section 3
        </span>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0.2rem 0 1.25rem" }}>
          Fleet Transit & Delivery Reliability
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Total Trips Dispatched
            </div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "var(--text)", marginTop: "0.35rem" }}>
              {logisticsKpis.totalTrips}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 600, marginTop: "0.2rem" }}>
              100% manifest tracking
            </div>
          </div>

          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Delayed Trips
            </div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#d97706", marginTop: "0.35rem" }}>
              {logisticsKpis.delayedTrips}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#d97706", fontWeight: 600, marginTop: "0.2rem" }}>
              {logisticsKpis.delayPct} of all completed trips
            </div>
          </div>

          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Critical SLA Breaches
            </div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#dc2626", marginTop: "0.35rem" }}>
              {logisticsKpis.slaBreaches}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 600, marginTop: "0.2rem" }}>
              {logisticsKpis.breachPct} life-saving breach rate
            </div>
          </div>

          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Average Arrival Delay
            </div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#0284c7", marginTop: "0.35rem" }}>
              {logisticsKpis.averageDelay}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              Across all delayed convoys
            </div>
          </div>
        </div>
      </div>

      {/* Section 4 — State-Wise Operational Data */}
      {/* Section 4 — Operational Breakdown */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: isDistrictOfficer ? "#059669" : "#0284c7", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Section 4
            </span>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0.2rem 0 0" }}>
              {isDistrictOfficer && scopeActive
                ? `District Administrative Circles & Sub-Divisions — ${assignedDistrict}`
                : isStateAuthority
                ? `State-Wise Operational Breakdown — ${assignedState} Spotlight`
                : "State-Wise Operational Breakdown"}
            </h2>
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {isDistrictOfficer && scopeActive ? "6 Kamrup Metro Circles Tracked" : "8 Northeast States Tracked"}
          </span>
        </div>

        {isDistrictOfficer && scopeActive ? (
          <div className="table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left", background: "var(--surface-2)" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>Circle Name</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Administrative HQ / Corridor</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Incidents</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Trips</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Delays</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Avg Clearance Time</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Vulnerability Tier</th>
                </tr>
              </thead>
              <tbody>
                {DISTRICT_CIRCLES_DATA.map((row) => (
                  <tr
                    key={row.circle}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: row.delays > 2 ? "rgba(239, 68, 68, 0.04)" : undefined,
                    }}
                  >
                    <td style={{ padding: "0.8rem 1rem", fontWeight: 700 }}>
                      {row.circle}
                    </td>
                    <td style={{ padding: "0.8rem 1rem", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                      {row.headquarters}
                    </td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "center", fontWeight: 600 }}>
                      {row.incidents}
                    </td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "center", fontWeight: 600 }}>
                      {row.trips}
                    </td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "center", fontWeight: 700, color: row.delays > 2 ? "#dc2626" : "inherit" }}>
                      {row.delays}
                    </td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
                      {row.avgClearance}
                    </td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "right" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "0.2rem 0.6rem",
                          borderRadius: "999px",
                          background: `${row.vulnerabilityColor}15`,
                          color: row.vulnerabilityColor,
                          border: `1px solid ${row.vulnerabilityColor}40`,
                        }}
                      >
                        {row.vulnerability}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left", background: "var(--surface-2)" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>State</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Incidents</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Trips</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Delays</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Avg Clearance Time</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Vulnerability Tier</th>
                </tr>
              </thead>
              <tbody>
                {STATE_OPERATIONAL_DATA.map((row) => {
                  const isAssigned = isStateAuthority && row.state.toLowerCase().includes(assignedState.toLowerCase());
                  return (
                    <tr
                      key={row.state}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isAssigned ? "rgba(2, 132, 199, 0.08)" : undefined,
                        borderLeft: isAssigned ? "4px solid #0284c7" : undefined,
                      }}
                    >
                      <td style={{ padding: "0.8rem 1rem", fontWeight: 700 }}>
                        {row.state}
                        {isAssigned && (
                          <span
                            style={{
                              marginLeft: "0.5rem",
                              fontSize: "0.7rem",
                              background: "#0284c7",
                              color: "#fff",
                              padding: "0.15rem 0.4rem",
                              borderRadius: "4px",
                              fontWeight: 700,
                            }}
                          >
                            YOUR JURISDICTION
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.8rem 1rem", textAlign: "center", fontWeight: 600 }}>
                        {row.incidents}
                      </td>
                      <td style={{ padding: "0.8rem 1rem", textAlign: "center", fontWeight: 600 }}>
                        {row.trips}
                      </td>
                      <td style={{ padding: "0.8rem 1rem", textAlign: "center", fontWeight: 700, color: row.delays > 3 ? "#dc2626" : "inherit" }}>
                        {row.delays}
                      </td>
                      <td style={{ padding: "0.8rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
                        {row.avgClearance}
                      </td>
                      <td style={{ padding: "0.8rem 1rem", textAlign: "right" }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "0.2rem 0.6rem",
                            borderRadius: "999px",
                            background: `${row.vulnerabilityColor}15`,
                            color: row.vulnerabilityColor,
                            border: `1px solid ${row.vulnerabilityColor}40`,
                          }}
                        >
                          {row.vulnerability}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 5 — Export & Reporting */}
      <div
        style={{
          background: "linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          padding: "1.5rem",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1.25rem",
        }}
      >
        <div>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0284c7", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Section 5
          </span>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0.2rem 0 0.2rem" }}>
            Executive Report Generation & Data Export
          </h2>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Download verified operational summaries for inter-ministerial disaster reviews and state coordination councils.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            style={{
              background: "#0284c7",
              color: "#ffffff",
              border: "none",
              padding: "0.65rem 1.15rem",
              borderRadius: "10px",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(2, 132, 199, 0.25)",
            }}
          >
            📋 [Generate Report]
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              padding: "0.65rem 1.15rem",
              borderRadius: "10px",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            📥 [Export CSV]
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              padding: "0.65rem 1.15rem",
              borderRadius: "10px",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            📄 [Export PDF]
          </button>
        </div>
      </div>

      {/* Generated Report Summary Modal */}
      {showReportModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1.5rem",
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "18px",
              maxWidth: "680px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "2rem",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
              <div>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0284c7", textTransform: "uppercase" }}>
                  MDoNER Official Dossier
                </span>
                <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0.25rem 0 0" }}>
                  Northeast Corridor Operational Briefing
                </h3>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  Reporting Horizon: Monsoon Quarter · Generated: {new Date().toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                style={{
                  background: "var(--surface-2)",
                  border: "none",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.88rem", lineHeight: 1.5 }}>
              <div style={{ background: "var(--surface-2)", padding: "1rem", borderRadius: "10px" }}>
                <strong>Executive Summary:</strong>
                <p style={{ margin: "0.35rem 0 0" }}>
                  During the evaluated period, 150 incidents were logged across 8 Northeast states. The highest disruption concentration was observed along the NH-6 corridor (Meghalaya, 6 major incidents, 7 convoy delays) and the NH-29/NH-2 artery (Manipur & Nagaland).
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div style={{ background: "#f0fdf4", padding: "0.85rem", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
                  <div style={{ fontWeight: 700, color: "#166534" }}>Delivery Reliability</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#166534", margin: "0.2rem 0" }}>95.4%</div>
                  <div style={{ fontSize: "0.75rem", color: "#166534" }}>Within permissible life-saving SLA</div>
                </div>
                <div style={{ background: "#eff6ff", padding: "0.85rem", borderRadius: "10px", border: "1px solid #bfdbfe" }}>
                  <div style={{ fontWeight: 700, color: "#1e40af" }}>Mean Clearance Speed</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0284c7", margin: "0.2rem 0" }}>4.2 Hours</div>
                  <div style={{ fontSize: "0.75rem", color: "#1e40af" }}>Down from 5.1h previous season</div>
                </div>
              </div>

              <div>
                <strong>Action Directives:</strong>
                <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                  <li>Pre-position Bailey bridge components in Jowai and Kohima ahead of heavy rainfall alerts.</li>
                  <li>Mandate dual-SIM hybrid cellular/satellite telemetry devices for all pharmaceutical carriers navigating Atharamura and Sonapur passes.</li>
                </ul>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={handleExportPdf}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  padding: "0.55rem 1.1rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Print / Save PDF
              </button>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  padding: "0.55rem 1.1rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
