"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, setCsrfToken, unwrap, type Principal } from "@/shared/api";
import { SURFACE_HOME, surfaceForRole, useSession } from "@/shared/auth";
import { Banner, Button, Card, ErrorNotice, Field } from "@/shared/ui";

const ROLES = [
  "REGIONAL_AUTHORITY", "STATE_AUTHORITY", "DISTRICT_VERIFIER", "EMERGENCY_COORDINATOR", "PLATFORM_ADMINISTRATOR",
  "FIELD_OFFICER", "LOCAL_AUTHORITY", "ROAD_INSPECTION", "FLEET_MANAGER", "DELIVERY_COORDINATOR", "TRANSPORT_OPERATOR",
] as const;

export const ORG_GOV_ID = "00000000-0000-4000-a000-000000000001";
export const ORG_FIELD_ID = "00000000-0000-4000-a000-000000000002";
export const ORG_LOGISTICS_ID = "00000000-0000-4000-a000-000000000003";

export interface DemoPersona {
  userId: string;
  name: string;
  email: string;
  role: (typeof ROLES)[number];
  orgId: string;
  orgName: string;
  title: string;
  scope: string;
  portal: "government" | "field" | "logistics";
  badge: string;
  icon: string;
  description: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  // ── 1. Government Command Personas ─────────────────────────
  {
    userId: "d0000001-0000-4000-8000-000000000001",
    name: "Ananya Sharma",
    email: "ananya@ner-gov.in",
    role: "REGIONAL_AUTHORITY",
    orgId: ORG_GOV_ID,
    orgName: "NER Regional Government Authority",
    title: "MDoNER Regional Commander",
    scope: "NER-Wide (All 8 North-East States)",
    portal: "government",
    badge: "Regional",
    icon: "🏛️",
    description: "Full strategic oversight across all 8 North-Eastern states, inter-state bottleneck analysis and policy planning.",
  },
  {
    userId: "d0000002-0000-4000-8000-000000000002",
    name: "Bhaskar Singh",
    email: "bhaskar@assam-gov.in",
    role: "STATE_AUTHORITY",
    orgId: ORG_GOV_ID,
    orgName: "Assam State Department of Transport",
    title: "State Transport Authority",
    scope: "Assam State Highways & Districts",
    portal: "government",
    badge: "State",
    icon: "🏔️",
    description: "State-level road network governance, district comparisons, and vital highway maintenance monitoring.",
  },
  {
    userId: "d0000003-0000-4000-8000-000000000003",
    name: "Chitralekha Devi",
    email: "chitra@kamrup-verifier.in",
    role: "DISTRICT_VERIFIER",
    orgId: ORG_GOV_ID,
    orgName: "Kamrup Metropolitan Administration",
    title: "District Incident Verifier",
    scope: "Kamrup Metropolitan District",
    portal: "government",
    badge: "District",
    icon: "📋",
    description: "Adjudicates and verifies incoming ground reports, officially declares road closures or cautions with reasons.",
  },
  {
    userId: "d0000004-0000-4000-8000-000000000004",
    name: "Debraj Kalita",
    email: "debraj@emergency-ner.in",
    role: "EMERGENCY_COORDINATOR",
    orgId: ORG_GOV_ID,
    orgName: "NER Disaster Management & Emergency Response",
    title: "Disaster Emergency Coordinator",
    scope: "NER Disaster Corridors",
    portal: "government",
    badge: "Emergency",
    icon: "🚨",
    description: "Prioritized disaster response, isolated hospital reachability, and critical supply route planning.",
  },

  // ── 2. Field Operations Personas ───────────────────────────
  {
    userId: "d0000005-0000-4000-8000-000000000005",
    name: "Elangbam Meitei",
    email: "elangbam@field-assam.in",
    role: "FIELD_OFFICER",
    orgId: ORG_FIELD_ID,
    orgName: "Assam Field & Roads Authority",
    title: "Senior Field Officer",
    scope: "NH-27 / NH-6 Lifeline Corridor",
    portal: "field",
    badge: "Ground Patrol",
    icon: "🚜",
    description: "On-ground geo-tagged incident reporting with photographic evidence and offline IndexedDB synchronization.",
  },
  {
    userId: "d0000006-0000-4000-8000-000000000006",
    name: "Falguni Boro",
    email: "falguni@village-assam.in",
    role: "LOCAL_AUTHORITY",
    orgId: ORG_FIELD_ID,
    orgName: "Byrnihat Local Panchayat Authority",
    title: "Local Community Representative",
    scope: "Byrnihat-Nongpoh Border Belt",
    portal: "field",
    badge: "Local",
    icon: "🏘️",
    description: "Reports localized bridge scours, flash floods, and mudslides directly to the central intelligence platform.",
  },
  {
    userId: "d0000007-0000-4000-8000-000000000007",
    name: "Girish Nongmeikapam",
    email: "girish@roads-assam.in",
    role: "ROAD_INSPECTION",
    orgId: ORG_FIELD_ID,
    orgName: "NER Highway Infrastructure Inspection Wing",
    title: "PWD Bridge & Road Inspector",
    scope: "NH-6 Mountain Bridges",
    portal: "field",
    badge: "Inspector",
    icon: "🛠️",
    description: "Performs technical structural evaluations of mountain bridges and records real-time axle-weight restrictions.",
  },

  // ── 3. Logistics & Transport Personas ──────────────────────
  {
    userId: "d0000008-0000-4000-8000-000000000008",
    name: "Hema Goswami",
    email: "hema@ner-logistics.com",
    role: "FLEET_MANAGER",
    orgId: ORG_LOGISTICS_ID,
    orgName: "NER Integrated Logistics Consortium",
    title: "Regional Fleet Manager",
    scope: "North-East Transport Fleets",
    portal: "logistics",
    badge: "Fleet Ops",
    icon: "🚚",
    description: "Monitors real-time GPS fleet positions, tracks vehicle stale statuses, and evaluates AI-recommended alternate routes.",
  },
  {
    userId: "d0000009-0000-4000-8000-000000000009",
    name: "Indraneil Datta",
    email: "indraneil@ner-logistics.com",
    role: "DELIVERY_COORDINATOR",
    orgId: ORG_LOGISTICS_ID,
    orgName: "NER Essential Supplies Supply-Chain",
    title: "Essential Supplies Dispatcher",
    scope: "Hospitals, Depots & Consignments",
    portal: "logistics",
    badge: "Deliveries",
    icon: "📦",
    description: "Tracks SLA compliance for life-saving consignments (oxygen, vaccines, food) and handles disruption rerouting.",
  },
  {
    userId: "d0000010-0000-4000-8000-000000000010",
    name: "Jayashree Teron",
    email: "jayashree@driver-ner.com",
    role: "TRANSPORT_OPERATOR",
    orgId: ORG_LOGISTICS_ID,
    orgName: "NER Integrated Logistics Consortium",
    title: "Heavy Vehicle Transport Operator",
    scope: "Assigned Tanker AS-01-HC-9821",
    portal: "logistics",
    badge: "Driver",
    icon: "🚛",
    description: "Dedicated in-cab mobile view with active route guidance, road hazard alerts, and 1-tap delay/SOS reporting.",
  },
];

/** Only follow same-site relative destinations; anything else could be an open redirect. */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
}

export function landingFor(principal: Principal, next: string | null): string {
  const surface = surfaceForRole(principal.role);
  const safe = safeNext(next);
  return safe ?? (surface ? SURFACE_HOME[surface] : "/account");
}

interface SessionResponse {
  csrf_token?: string;
  principal?: Principal;
}

export function useCompleteLogin() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  return (result: SessionResponse) => {
    if (result.csrf_token) setCsrfToken(result.csrf_token);
    if (result.principal) {
      session.applyPrincipal(result.principal);
      router.replace(landingFor(result.principal, params.get("next")));
    } else {
      session.refresh();
    }
  };
}

export function LoginView() {
  const params = useSearchParams();
  const session = useSession();
  const complete = useCompleteLogin();

  const [activeTab, setActiveTab] = useState<"government" | "field" | "logistics" | "custom">("government");
  const [loggingInId, setLoggingInId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Custom dev login form state
  const [customUserId, setCustomUserId] = useState("");
  const [customOrgId, setCustomOrgId] = useState("");
  const [customRole, setCustomRole] = useState<(typeof ROLES)[number]>("FIELD_OFFICER");
  const [customBusy, setCustomBusy] = useState(false);

  // OIDC state
  const [oidcBusy, setOidcBusy] = useState(false);

  const reason = params.get("reason");

  const loginAsPersona = async (p: DemoPersona) => {
    setLoggingInId(p.userId);
    setError(null);
    try {
      const res = await unwrap(() =>
        api.POST("/api/v1/auth/dev-session", {
          body: {
            user_id: p.userId,
            org_id: p.orgId,
            role: p.role,
          },
        }),
      );
      complete(res as SessionResponse);
    } catch (err) {
      setError(err);
      setLoggingInId(null);
    }
  };

  const submitCustom = async (e: FormEvent) => {
    e.preventDefault();
    setCustomBusy(true);
    setError(null);
    try {
      const res = await unwrap(() =>
        api.POST("/api/v1/auth/dev-session", {
          body: {
            user_id: customUserId.trim(),
            org_id: customOrgId.trim(),
            role: customRole,
          },
        }),
      );
      complete(res as SessionResponse);
    } catch (err) {
      setError(err);
    } finally {
      setCustomBusy(false);
    }
  };

  const startOidc = async () => {
    setOidcBusy(true);
    setError(null);
    try {
      const { redirect_url } = (await unwrap(() => api.GET("/api/v1/auth/oidc/init"))) as { redirect_url?: string };
      if (!redirect_url) throw new Error("The identity provider is not configured");
      window.location.assign(redirect_url);
    } catch (e) {
      setError(e);
      setOidcBusy(false);
    }
  };

  const filteredPersonas = DEMO_PERSONAS.filter((p) => p.portal === activeTab);

  return (
    <div className="login-wrap" style={{ maxWidth: "1080px", margin: "0 auto", padding: "2rem 1rem" }}>
      <div className="stack" style={{ gap: "1.75rem" }}>
        
        {/* Branding & Header */}
        <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
          <div className="row" style={{ justifyContent: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1.8rem" }}>⛰️</span>
            <span style={{ fontWeight: 800, fontSize: "1.4rem", letterSpacing: "0.06em", color: "var(--color-primary-dark, #0284c7)" }}>
              PARVA
            </span>
            <span className="badge" style={{ backgroundColor: "#0284c7", color: "white", fontSize: "0.75rem", padding: "0.2rem 0.5rem", borderRadius: "999px" }}>
              SIH 2026
            </span>
          </div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700, margin: "0 0 0.4rem 0" }}>
            NER Smart Logistics &amp; Accessibility Platform
          </h1>
          <p className="muted" style={{ maxWidth: "680px", margin: "0 auto", fontSize: "0.95rem" }}>
            AI-Driven Spatial Intelligence, Road Resilience &amp; Critical Supply Grid for the North Eastern Region.
            Select a verified persona below to enter your operational surface.
          </p>
        </div>

        {/* Notices & Session Alerts */}
        {reason === "expired" || session.expired ? (
          <Banner tone="warn" title="Your session ended">
            <p className="small">Please select a persona or sign in again. Reports saved offline on this device are safe and will resume syncing once connected.</p>
          </Banner>
        ) : null}
        {session.status === "service_error" ? (
          <ErrorNotice error={session.error} subject="your session" onRetry={session.refresh} />
        ) : null}
        {error ? <ErrorNotice error={error} subject="Authentication" /> : null}

        {/* Portal Tabs Selector */}
        <div
          role="tablist"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.5rem",
            backgroundColor: "var(--color-surface-sunken, #f1f5f9)",
            padding: "0.35rem",
            borderRadius: "0.75rem",
          }}
        >
          <button
            role="tab"
            aria-selected={activeTab === "government"}
            onClick={() => setActiveTab("government")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.75rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              fontWeight: 600,
              fontSize: "0.92rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: activeTab === "government" ? "white" : "transparent",
              color: activeTab === "government" ? "#0f172a" : "#64748b",
              boxShadow: activeTab === "government" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <span>🏛️</span>
            <span>Government Portal (4)</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "field"}
            onClick={() => setActiveTab("field")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.75rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              fontWeight: 600,
              fontSize: "0.92rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: activeTab === "field" ? "white" : "transparent",
              color: activeTab === "field" ? "#0f172a" : "#64748b",
              boxShadow: activeTab === "field" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <span>🚜</span>
            <span>Field Operations (3)</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "logistics"}
            onClick={() => setActiveTab("logistics")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.75rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              fontWeight: 600,
              fontSize: "0.92rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: activeTab === "logistics" ? "white" : "transparent",
              color: activeTab === "logistics" ? "#0f172a" : "#64748b",
              boxShadow: activeTab === "logistics" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <span>🚚</span>
            <span>Logistics &amp; Fleet (3)</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "custom"}
            onClick={() => setActiveTab("custom")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.75rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              fontWeight: 600,
              fontSize: "0.92rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: activeTab === "custom" ? "white" : "transparent",
              color: activeTab === "custom" ? "#0f172a" : "#64748b",
              boxShadow: activeTab === "custom" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <span>⚙️</span>
            <span>Custom / SSO</span>
          </button>
        </div>

        {/* Persona Cards View */}
        {activeTab !== "custom" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {filteredPersonas.map((p) => {
              const isBusy = loggingInId === p.userId;
              return (
                <div
                  key={p.userId}
                  className="card"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "1.4rem",
                    borderRadius: "0.75rem",
                    border: "1px solid var(--color-border, #e2e8f0)",
                    backgroundColor: "var(--color-surface, #ffffff)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  <div className="stack" style={{ gap: "0.75rem" }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div className="row" style={{ gap: "0.6rem" }}>
                        <span style={{ fontSize: "1.75rem" }}>{p.icon}</span>
                        <div>
                          <strong style={{ fontSize: "1.05rem", display: "block" }}>{p.name}</strong>
                          <span className="small muted">{p.email}</span>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "0.15rem 0.5rem",
                          borderRadius: "0.375rem",
                          backgroundColor: "#f1f5f9",
                          color: "#334155",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {p.badge}
                      </span>
                    </div>

                    <div>
                      <div style={{ fontWeight: 600, color: "var(--color-primary, #0369a1)", fontSize: "0.9rem" }}>
                        {p.title}
                      </div>
                      <div className="small muted" style={{ marginTop: "0.2rem" }}>
                        Scope: <strong>{p.scope}</strong>
                      </div>
                    </div>

                    <p className="small" style={{ color: "#475569", lineHeight: 1.45, margin: "0.25rem 0" }}>
                      {p.description}
                    </p>
                  </div>

                  <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid #f1f5f9" }}>
                    <Button
                      variant="primary"
                      size="normal"
                      busy={isBusy}
                      onClick={() => void loginAsPersona(p)}
                      style={{ width: "100%", justifyContent: "center" }}
                    >
                      {isBusy ? "Authenticating…" : `Enter as ${p.name.split(" ")[0]} →`}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Custom Manual / OIDC Fallback */
          <div className="grid cols-2" style={{ gap: "1.5rem" }}>
            <Card title="Direct OIDC Single Sign-On">
              <div className="stack" style={{ gap: "1rem" }}>
                <p className="small muted">
                  For enterprise and production deployments integrated with Government National Single Sign-On (Parichay/JanParichay) or OIDC Identity Provider.
                </p>
                <Button variant="primary" size="large" busy={oidcBusy} onClick={() => void startOidc()}>
                  Sign in with Government SSO
                </Button>
              </div>
            </Card>

            <Card title="Custom Developer Credentials">
              <form className="stack" onSubmit={submitCustom} style={{ gap: "0.75rem" }}>
                <Field label="User UUID" htmlFor="dev-user">
                  <input
                    id="dev-user"
                    value={customUserId}
                    onChange={(e) => setCustomUserId(e.target.value)}
                    placeholder="d0000001-0000-4000-8000-000000000001"
                    required
                  />
                </Field>
                <Field label="Organization UUID" htmlFor="dev-org">
                  <input
                    id="dev-org"
                    value={customOrgId}
                    onChange={(e) => setCustomOrgId(e.target.value)}
                    placeholder={ORG_GOV_ID}
                    required
                  />
                </Field>
                <Field label="Role" htmlFor="dev-role">
                  <select
                    id="dev-role"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value as (typeof ROLES)[number])}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button type="submit" busy={customBusy}>
                  Start Custom Session
                </Button>
              </form>
            </Card>
          </div>
        )}

        {/* Footer & Public Link */}
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--color-border, #e2e8f0)", paddingTop: "1rem" }}>
          <p className="small muted" style={{ margin: 0 }}>
            🔒 Authenticated sessions are bound to role scopes and signed with HttpOnly token cookies.
          </p>
          <Link href="/public" className="small" style={{ fontWeight: 600, color: "var(--color-primary, #0369a1)" }}>
            Public Citizen Route &amp; Disruption Portal →
          </Link>
        </div>

      </div>
    </div>
  );
}
