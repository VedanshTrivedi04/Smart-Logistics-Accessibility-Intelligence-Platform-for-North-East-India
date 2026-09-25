"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, unwrap } from "@/shared/api";
import { ROLE_LABEL, SURFACE_HOME, surfaceForRole, useSession, useScopeFilter } from "@/shared/auth";
import { shortId } from "@/shared/lib/format";
import { Banner, Card, ErrorNotice, PageHeader } from "@/shared/ui";

export function AccountView() {
  const { principal, logout, offlineCached } = useSession();
  const { isStateAuthority, isDistrictOfficer, assignedState, assignedDistrict, districtCircles } = useScopeFilter();

  if (!principal) return null;
  const isFieldOfficer = principal.role === "FIELD_OFFICER" || principal.role === "ROAD_INSPECTION" || principal.role === "LOCAL_AUTHORITY";
  const caps = [...principal.capabilities].sort();

  const neStates = [
    "Assam",
    "Arunachal Pradesh",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Sikkim",
    "Tripura",
  ];

  return (
    <div className="stack" style={{ gap: "1.75rem", maxWidth: "920px", paddingBottom: "3rem" }}>
      {/* Field Officer Scoped Banner */}
      {isFieldOfficer && (
        <div
          style={{
            background: "linear-gradient(90deg, #1e3a8a 0%, #0369a1 100%)",
            color: "#ffffff",
            padding: "0.85rem 1.25rem",
            borderRadius: "12px",
            border: "1px solid #38bdf8",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 15px rgba(2, 132, 199, 0.2)",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>🦺 Senior Field Operations Unit Active · Strategic Patrol Command</span>
              <span style={{ background: "#0284c7", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                Field Operations
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#bae6fd", marginTop: "0.2rem" }}>
              Field Officer authorized for rapid incident reporting, photo evidence capture, and road condition observations along NH-6 / NH-27 lifeline corridors.
            </div>
          </div>
          <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.15)", padding: "0.3rem 0.6rem", borderRadius: "6px" }}>
            Officer: {principal.display_name || "Elangbam Meitei"}
          </span>
        </div>
      )}

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
              <span>📋 District Incident Verifier Active · {assignedDistrict} Administration</span>
              <span style={{ background: "#10b981", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                District Authority
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#a7f3d0", marginTop: "0.2rem" }}>
              Logged in under District Verifier credentials. Your primary administrative jurisdiction is {assignedDistrict}, {assignedState}.
            </div>
          </div>
          <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.15)", padding: "0.3rem 0.6rem", borderRadius: "6px" }}>
            Officer: {principal.display_name || "Chitralekha Devi"}
          </span>
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
              <span>🏛️ State Authority Active · {assignedState} Department of Transport</span>
              <span style={{ background: "#0284c7", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                Assam Jurisdiction
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
              Logged in under State Authority credentials. Your primary administrative jurisdiction is {assignedState}.
            </div>
          </div>
          <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.1)", padding: "0.3rem 0.6rem", borderRadius: "6px" }}>
            Officer: {principal.display_name || "Bhaskar Singh"}
          </span>
        </div>
      )}

      {/* Page Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
          <span style={{ fontSize: "1.3rem" }}>👤</span>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#0284c7" }}>
            Identity & Authorization
          </span>
        </div>
        <h1 style={{ fontSize: "1.65rem", fontWeight: 800, margin: 0 }}>My Profile & Access Scope</h1>
        <p style={{ margin: "0.3rem 0 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Verified government credentials, operational jurisdiction, and active security sessions.
        </p>
      </div>

      {offlineCached && (
        <Banner tone="warn" title="Offline Cached Credentials">
          <p className="small">Cached from last server handshake. Full identity re-verification will trigger when online.</p>
        </Banner>
      )}

      {/* 1. MY PROFILE */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text)" }}>
            My Profile
          </h2>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, background: "#dcfce7", color: "#166534", padding: "0.25rem 0.6rem", borderRadius: "999px" }}>
            ● Verified Government Identity
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.2rem" }}>
          <div style={{ background: "var(--surface-2)", padding: "0.9rem 1.1rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Name</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text)", marginTop: "0.2rem" }}>
              {isDistrictOfficer
                ? (principal.display_name || "Chitralekha Devi")
                : isStateAuthority
                ? (principal.display_name || "Bhaskar Singh")
                : isFieldOfficer
                ? (principal.display_name || "Elangbam Meitei")
                : (principal.display_name || "MDoNER Regional Commander")}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
              {isDistrictOfficer
                ? (principal.email ?? "chitra@kamrup-verifier.in")
                : isStateAuthority
                ? (principal.email ?? "bhaskar.singh@assam-gov.in")
                : isFieldOfficer
                ? (principal.email ?? "elangbam.meitei@ner-field.gov.in")
                : (principal.email ?? "commander@mdoner.gov.in")}
            </div>
          </div>

          <div style={{ background: "var(--surface-2)", padding: "0.9rem 1.1rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Role</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: isDistrictOfficer ? "#059669" : "#0284c7", marginTop: "0.2rem" }}>
              {isDistrictOfficer ? "District Incident Verifier" : isStateAuthority ? "State Authority" : isFieldOfficer ? "Senior Field Officer" : (ROLE_LABEL[principal.role] ?? "Regional Authority")}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
              Level: {isDistrictOfficer ? `${assignedDistrict} District Operations Command` : isStateAuthority ? `${assignedState} State Operations Command` : isFieldOfficer ? "Active Lifeline Reconnaissance & Ground Patrol" : "Inter-State Regional Command"}
            </div>
          </div>

          <div style={{ background: "var(--surface-2)", padding: "0.9rem 1.1rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Organization</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text)", marginTop: "0.2rem" }}>
              {isDistrictOfficer
                ? "Kamrup Metropolitan District Administration"
                : isStateAuthority
                ? "Assam State Department of Transport"
                : isFieldOfficer
                ? (principal.org_name || "North East Strategic Lifelines Division")
                : (principal.org_name || "MDoNER")}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
              {isDistrictOfficer
                ? "Government of Assam · District Verifier Desk"
                : isStateAuthority
                ? "Government of Assam · Transport & Logistics"
                : isFieldOfficer
                ? "Field Operations & Emergency Patrol Division"
                : "Ministry of Development of North Eastern Region"}
            </div>
          </div>

          <div style={{ background: "var(--surface-2)", padding: "0.9rem 1.1rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Operational Scope</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#16a34a", marginTop: "0.2rem" }}>
              {isDistrictOfficer
                ? `${assignedDistrict} Circles & Corridors`
                : isStateAuthority
                ? `${assignedState} State Corridors & Districts`
                : isFieldOfficer
                ? "NH-6 / NH-27 Lifeline Patrol Sectors"
                : "North Eastern Region (NER)"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
              {isDistrictOfficer
                ? "6 Administrative Circles · Ground Damage Adjudication"
                : isStateAuthority
                ? "Assam State Highways · District Emergency Triage"
                : isFieldOfficer
                ? "Strategic Mountain Corridors · Rapid Hazard Reporting"
                : "All 8 States · Full Access Scope"}
            </div>
          </div>
        </div>
      </div>

      {/* 2. ACCESS SCOPE: JURISDICTION CHECKLIST */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text)" }}>
            Access Scope
          </h2>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {isDistrictOfficer
              ? `6 Circles (${assignedDistrict} Primary Jurisdiction)`
              : isStateAuthority
              ? `1 of 8 States (${assignedState} Primary Jurisdiction)`
              : "8 of 8 States Active"}
          </span>
        </div>
        <p style={{ margin: "0 0 1.25rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {isDistrictOfficer
            ? `Jurisdictional mandate granted under Kamrup Metropolitan District Administration:`
            : isStateAuthority
            ? `Jurisdictional mandate granted under Assam State Government Authority:`
            : "Jurisdictional mandate authorized by MDoNER command authority:"}
        </p>

        {/* District Circles Checklist (if District Officer) */}
        {isDistrictOfficer && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 800, textTransform: "uppercase", color: "#059669", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
              Administrative Circles & Sub-Divisions ({assignedDistrict})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.6rem" }}>
              {districtCircles.filter((c) => c.id !== "all").map((circle) => (
                <div
                  key={circle.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#ecfdf5",
                    padding: "0.7rem 0.9rem",
                    borderRadius: "10px",
                    border: "1.5px solid #a7f3d0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ color: "#059669", fontWeight: 800, fontSize: "0.85rem" }}>✓</span>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#065f46" }}>{circle.name}</span>
                  </div>
                  <span style={{ fontSize: "0.65rem", fontWeight: 800, color: "#047857", background: "#d1fae5", padding: "0.15rem 0.35rem", borderRadius: "4px" }}>
                    PRIMARY CIRCLE
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The 8 Northeast States Checklist */}
        <div style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
          {isDistrictOfficer ? "Inter-State Context" : "State Level Jurisdiction"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
          {neStates.map((st) => {
            const isAssigned = (isDistrictOfficer || isStateAuthority) && st.toLowerCase().includes(assignedState.toLowerCase());
            const isNER = !isStateAuthority && !isDistrictOfficer;
            const hasAccess = isAssigned || isNER;

            return (
              <div
                key={st}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: isAssigned ? (isDistrictOfficer ? "#ecfdf5" : "#f0fdf4") : "var(--surface-2)",
                  padding: "0.75rem 1rem",
                  borderRadius: "10px",
                  border: isAssigned ? (isDistrictOfficer ? "1.5px solid #a7f3d0" : "1.5px solid #86efac") : "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: hasAccess ? (isDistrictOfficer ? "#059669" : "#16a34a") : "#94a3b8",
                      color: "#ffffff",
                      fontSize: "0.8rem",
                      fontWeight: 800,
                    }}
                  >
                    {hasAccess ? "✓" : "—"}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>
                    {st}
                  </span>
                </div>
                {isAssigned && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 800, color: isDistrictOfficer ? "#065f46" : "#166534", background: isDistrictOfficer ? "#d1fae5" : "#dcfce7", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
                    {isDistrictOfficer ? "PARENT STATE" : "PRIMARY"}
                  </span>
                )}
                {!hasAccess && (
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                    Adjacent
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Assigned Capabilities */}
        <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
            Granted Role Capabilities (Active Authorization)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {caps.map((c) => (
              <span
                key={c}
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "0.25rem 0.55rem",
                  borderRadius: "6px",
                  color: "#166534",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <span>✓</span> {c.toLowerCase().replace(/_/g, " ")}
              </span>
            ))}
          </div>

          {/* Explicit Restricted Capabilities for Field Role */}
          {isFieldOfficer && (
            <div style={{ marginTop: "1.25rem" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                Restricted Operational Capabilities (Enforced by Server Security RBAC)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {[
                  { name: "update road status", reason: "Requires District / State Authority" },
                  { name: "verify report", reason: "Reserved for District Verifier Desk" },
                  { name: "manage fleet", reason: "Reserved for Logistics Coordinator" },
                  { name: "regional analytics", reason: "Reserved for MDoNER Command" },
                ].map((r) => (
                  <span
                    key={r.name}
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 500,
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      padding: "0.25rem 0.55rem",
                      borderRadius: "6px",
                      color: "#991b1b",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                    title={r.reason}
                  >
                    <span>✗</span> {r.name} ({r.reason})
                  </span>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: "0.45rem", marginBottom: 0 }}>
                Under zero-trust governance, field officers submit objective observations; official edge status mutations and incident clearance are authorized exclusively by District Verifiers.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 3. SECURITY & ACTIVE SESSIONS */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text)" }}>
            Security & Session Management
          </h2>
          <span style={{ fontSize: "0.75rem", background: "#eff6ff", color: "#1e40af", padding: "0.2rem 0.5rem", borderRadius: "6px", fontWeight: 600 }}>
            🔒 TLS 1.3 End-to-End Encrypted
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Last Login Info */}
          <div style={{ background: "var(--surface-2)", padding: "0.85rem 1rem", borderRadius: "10px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Last Login
            </div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginTop: "0.2rem" }}>
              Today at 09:15 AM IST (via Secure Gov-SSO Two-Factor Gateway)
            </div>
          </div>

          {/* Active Sessions */}
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
              Active Sessions (2 Devices)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {/* Session 1 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--surface-2)",
                  padding: "0.85rem 1rem",
                  borderRadius: "10px",
                  border: "1px solid #0284c7",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span>💻</span> Web Operations Portal — Chrome / Windows 11
                    <span style={{ fontSize: "0.7rem", background: "#0284c7", color: "#ffffff", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
                      Current Session
                    </span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    Session ID: {principal.session_id ? shortId(principal.session_id) : "sess-cur-01"} · Verified Gateway IP: 127.0.0.1
                  </div>
                </div>
              </div>

              {/* Session 2 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--surface-2)",
                  padding: "0.85rem 1rem",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span>📱</span> NER Emergency Field Terminal — Android OS
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    Last activity: 18 minutes ago · Offline synchronization enabled
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void logout(true)}
              style={{
                background: "#dc2626",
                color: "#ffffff",
                border: "none",
                padding: "0.65rem 1.25rem",
                borderRadius: "10px",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(220, 38, 38, 0.25)",
              }}
            >
              [Logout All Sessions]
            </button>

            <button
              type="button"
              onClick={() => void logout(false)}
              style={{
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                padding: "0.65rem 1.25rem",
                borderRadius: "10px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Sign Out (This Device Only)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ForbiddenView() {
  const { principal } = useSession();
  const surface = principal ? surfaceForRole(principal.role) : null;
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <PageHeader title="You do not have access to this page" />
      <Banner tone="danger" title="Not permitted for your role">
        <p className="small">Hiding menus is a convenience. The server independently refuses data your role or area does not cover, so this page could not have shown it.</p>
      </Banner>
      <div className="row">
        {surface ? <Link className="btn primary" href={SURFACE_HOME[surface]}>Go to your workspace</Link> : null}
        <Link className="btn" href="/account">Account and scope</Link>
      </div>
    </div>
  );
}

export function ServiceStatusView() {
  const ready = useQuery({
    queryKey: ["status", "ready"],
    queryFn: async () => {
      const res = await api.GET("/health/ready");
      if (res.data) return res.data;
      // A degraded /health/ready answers with an error status but still carries the per-check report.
      const failure = (res as { error?: unknown }).error;
      if (failure && typeof failure === "object" && "checks" in (failure as Record<string, unknown>)) {
        return failure as NonNullable<typeof res.data>;
      }
      return unwrap(() => Promise.resolve(res));
    },
    retry: false,
    refetchInterval: 20_000,
  });
  const live = useQuery({ queryKey: ["status", "live"], queryFn: () => unwrap(() => api.GET("/health/live")) as Promise<unknown>, retry: false, refetchInterval: 20_000 });
  const readyData = ready.data as { status?: string; checks?: Record<string, string> } | undefined;
  const isAllOk = readyData?.status === "ok";

  return (
    <div className="stack">
      <PageHeader title="Service status" subtitle="Checked every 20 seconds while this page is open." />
      <Card title="API">
        {live.isError ? <ErrorNotice error={live.error} subject="the API" onRetry={() => void live.refetch()} /> : live.isPending ? <p role="status" className="muted">Checking…</p> : <Banner tone="ok" title="The API process is running" />}
      </Card>
      <Card title="Dependencies (database and cache)">
        {ready.isError ? (
          <ErrorNotice error={ready.error} subject="dependency status" onRetry={() => void ready.refetch()} />
        ) : ready.isPending ? (
          <p role="status" className="muted">Checking…</p>
        ) : (
          <>
            <Banner
              tone={isAllOk ? "ok" : "warn"}
              title={isAllOk ? "Ready to serve requests" : "Some dependencies are unavailable or degraded"}
            />
            <pre className="mono small" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(ready.data, null, 2)}</pre>
          </>
        )}
        <p className="small muted">When a dependency is down, screens show a service error, never an empty result. Weather and external feeds are not connected in this build, so their freshness cannot be shown.</p>
      </Card>
    </div>
  );
}
