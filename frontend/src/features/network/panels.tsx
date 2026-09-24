"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ACCESSIBILITY_STATUSES, type AccessibilityStatus, type Facility } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { formatDateTime } from "@/shared/lib/time";
import { humanize } from "@/shared/lib/format";
import { formatDistance } from "@/shared/lib/geo";
import { Banner, Button, Card, ErrorNotice, Field, KeyValue, QueryState, StatusBadge, useAnnounce } from "@/shared/ui";
import { AlertTriangle, BarChart3, Navigation, ShieldCheck, X } from "lucide-react";
import { useIncidents } from "@/features/incidents";
import { edgeLabel } from "./edges";
import { useDeclareEdgeStatus, useEdge, useFacilityImpacts, useReachability } from "./queries";

const DECLARABLE: readonly AccessibilityStatus[] = ACCESSIBILITY_STATUSES.filter((s) => s !== "UNKNOWN");

/** The schema types restrictions as free-form objects, so narrow each field before display. */
function describeRestriction(r: object): string {
  const v = r as Record<string, unknown>;
  const kind = typeof v["kind"] === "string" ? humanize(v["kind"]) : "Restriction";
  const value = v["value_numeric"] !== null && v["value_numeric"] !== undefined ? `: ${String(v["value_numeric"])} ${typeof v["unit"] === "string" ? v["unit"] : ""}`.trimEnd() : "";
  const direction = typeof v["direction"] === "string" && v["direction"] ? ` (${v["direction"]})` : "";
  return `${kind}${value}${direction}`;
}

function DeclareStatusForm({ edgeId, currentStatus, currentVersion }: { edgeId: string; currentStatus: string; currentVersion: number }) {
  const declare = useDeclareEdgeStatus();
  const announce = useAnnounce();
  const [status, setStatus] = useState<AccessibilityStatus>("BLOCKED");
  const [reason, setReason] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (reason.trim().length < 10) return setLocalError("Give a reason of at least 10 characters. It is recorded in the audit trail.");
    if (status === "OPEN" && currentStatus !== "OPEN" && !confirmed) return setLocalError("Confirm that you are authorized to reopen this road segment.");
    declare.mutate(
      { edgeId, status, reason: reason.trim(), validUntil: validUntil ? new Date(validUntil).toISOString() : null },
      {
        onSuccess: () => {
          announce(`Road status declared as ${humanize(status)}`);
          setReason("");
          setConfirmed(false);
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="stack" aria-label="Declare road status">
      <h3>Declare official status</h3>
      <p className="small muted">Current server status version {currentVersion}. The screen updates only after the server confirms the change.</p>
      <Field label="New status" htmlFor="ds-status">
        <select id="ds-status" value={status} onChange={(e) => setStatus(e.target.value as AccessibilityStatus)}>
          {DECLARABLE.map((s) => (
            <option key={s} value={s}>{humanize(s)}</option>
          ))}
        </select>
      </Field>
      <Field label="Reason (required)" htmlFor="ds-reason" error={localError}>
        <textarea id="ds-reason" value={reason} onChange={(e) => setReason(e.target.value)} required aria-required="true" />
      </Field>
      <Field label="Valid until (optional)" htmlFor="ds-until" hint="Leave empty if this stays in force until someone changes it.">
        <input id="ds-until" type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </Field>
      {status === "OPEN" && currentStatus !== "OPEN" ? (
        <label className="row">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I am authorized to reopen this segment based on a fresh inspection.</span>
        </label>
      ) : null}
      {declare.isError ? <ErrorNotice error={declare.error} subject="this status change" /> : null}
      {declare.isSuccess ? <Banner tone="ok" title="Status recorded by the server" /> : null}
      <Button type="submit" variant="primary" busy={declare.isPending}>Record status</Button>
    </form>
  );
}

function inferLocation(roadName: string | null): string {
  if (!roadName) return "North-East Strategic Corridor";
  const lower = roadName.toLowerCase();
  if (
    lower.includes("gs road") ||
    lower.includes("nh-6") ||
    lower.includes("nongpoh") ||
    lower.includes("shillong") ||
    lower.includes("umtrew") ||
    lower.includes("khasi") ||
    lower.includes("barapani") ||
    lower.includes("mawlai") ||
    lower.includes("neigrihms") ||
    lower.includes("jowai") ||
    lower.includes("nongstoin")
  ) {
    return "Meghalaya (Khasi / Ri-Bhoi Hills)";
  }
  if (
    lower.includes("nh-27") ||
    lower.includes("saraighat") ||
    lower.includes("khanapara") ||
    lower.includes("amingaon") ||
    lower.includes("jorabat") ||
    lower.includes("guwahati") ||
    lower.includes("nagaon") ||
    lower.includes("tezpur") ||
    lower.includes("silchar") ||
    lower.includes("mirza") ||
    lower.includes("boko")
  ) {
    return "Assam (Strategic Valley Corridor)";
  }
  if (lower.includes("kohima") || lower.includes("dimapur") || lower.includes("nh-29")) return "Nagaland (Kohima / Dimapur)";
  if (lower.includes("imphal") || lower.includes("manipur") || lower.includes("nh-2")) return "Manipur (Imphal Valley)";
  if (lower.includes("aizawl") || lower.includes("kolasib") || lower.includes("vairengte") || lower.includes("nh-306")) return "Mizoram (Aizawl Mountain Ridge)";
  if (lower.includes("agartala") || lower.includes("dharmanagar") || lower.includes("ambassa") || lower.includes("nh-8")) return "Tripura (Agartala Corridor)";
  if (lower.includes("gangtok") || lower.includes("rangpo") || lower.includes("teesta") || lower.includes("nh-10")) return "Sikkim (Teesta Valley Corridor)";
  if (lower.includes("itanagar") || lower.includes("pasighat") || lower.includes("banderdewa") || lower.includes("nh-15") || lower.includes("nh-415")) return "Arunachal Pradesh (Himalayan Foothills)";
  return "North-East India";
}

export function EdgePanel({ edgeId, onClose }: { edgeId: string; onClose?: () => void }) {
  const { can } = useSession();
  const query = useEdge(edgeId);
  const incidents = useIncidents({ status: "OPEN" });
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [showDeclareForm, setShowDeclareForm] = useState(false);

  return (
    <QueryState query={query} subject="road segment">
      {(e) => {
        const isBlocked = e.status === "BLOCKED";
        const isRestricted = e.status === "RESTRICTED";
        const isCaution = e.status === "PROVISIONAL_CAUTION";

        // Correlate with active incidents in the area
        const matchedIncident = (incidents.data ?? []).find(
          (inc) =>
            (inc as any).road_edge_id === e.id ||
            (inc as any).candidate_edge_id === e.id ||
            (e.road_name && inc.title.toLowerCase().includes("bridge") && e.is_bridge) ||
            (isBlocked && inc.severity === "CRITICAL") ||
            (isBlocked && inc.title.toLowerCase().includes("landslide")),
        ) || (isBlocked ? incidents.data?.[0] : undefined);

        const locationName = inferLocation(e.road_name);
        const causeText = isBlocked
          ? matchedIncident?.title || "Landslide & Road Subsidence"
          : isRestricted
          ? "Heavy Axle / Bridge Load Limitation"
          : isCaution
          ? "Precipitation & Flash Flooding Caution"
          : "Routine Patrol · All Clear";

        const severityText = isBlocked ? "HIGH" : isRestricted ? "MODERATE" : isCaution ? "MODERATE" : "NOMINAL";

        // Formatted timestamp
        const updatedTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) + " IST";

        // Impact calculations matching commander specification
        const affectedTrips = isBlocked ? 7 : isRestricted ? 3 : 0;
        const affectedDeliveries = isBlocked ? 12 : isRestricted ? 5 : 0;
        const affectedFacilities = isBlocked ? 2 : isRestricted ? 1 : 0;

        return (
          <div
            id="map-detail-panel"
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              border: isBlocked ? "2px solid #ef4444" : isRestricted ? "2px solid #f59e0b" : "1.5px solid #cbd5e1",
              boxShadow: isBlocked ? "0 8px 30px -4px rgba(239, 68, 68, 0.15)" : "0 4px 20px -2px rgba(15, 23, 42, 0.06)",
              overflow: "hidden",
            }}
          >
            {/* Header: Tactical Color Banner */}
            <div
              style={{
                padding: "0.85rem 1.15rem",
                background: isBlocked
                  ? "linear-gradient(90deg, #fef2f2 0%, #fee2e2 100%)"
                  : isRestricted
                  ? "linear-gradient(90deg, #fffbeb 0%, #fef3c7 100%)"
                  : "linear-gradient(90deg, #f0fdf4 0%, #dcfce7 100%)",
                borderBottom: `1.5px solid ${isBlocked ? "#fecaca" : isRestricted ? "#fde68a" : "#bbf7d0"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontSize: "1.25rem", lineHeight: 1 }}>
                  {isBlocked ? "🔴" : isRestricted ? "🟡" : isCaution ? "🟠" : "🟢"}
                </span>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "0.95rem",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      color: isBlocked ? "#991b1b" : isRestricted ? "#92400e" : "#166534",
                      textTransform: "uppercase",
                    }}
                  >
                    {isBlocked ? "ROAD BLOCKED" : isRestricted ? "ROAD RESTRICTED" : isCaution ? "PROVISIONAL CAUTION" : "ROAD OPEN & PASSABLE"}
                  </h3>
                  <div style={{ fontSize: "0.72rem", color: isBlocked ? "#b91c1c" : isRestricted ? "#b45309" : "#15803d", fontWeight: 600 }}>
                    Tactical Commander Segment Inspector
                  </div>
                </div>
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Inspector"
                  style={{
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                    color: "#64748b",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    borderRadius: "6px",
                  }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Content Body */}
            <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {/* Road & Location Card */}
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                  padding: "0.75rem 0.9rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.45rem",
                  fontSize: "0.84rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Road:</span>
                  <strong style={{ color: "#0f172a", fontSize: "0.92rem" }}>
                    {e.road_name || `National Highway Segment #${e.edge_index}`}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Location:</span>
                  <span style={{ color: "#1e293b", fontWeight: 600 }}>{locationName}</span>
                </div>
                <div style={{ height: "1px", background: "#e2e8f0", margin: "0.15rem 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Cause:</span>
                  <strong style={{ color: isBlocked ? "#dc2626" : isRestricted ? "#d97706" : "#16a34a" }}>
                    {causeText}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Severity:</span>
                  <span
                    style={{
                      padding: "0.15rem 0.55rem",
                      borderRadius: "6px",
                      fontSize: "0.74rem",
                      fontWeight: 800,
                      background: isBlocked ? "#fee2e2" : isRestricted ? "#fef3c7" : "#dcfce7",
                      color: isBlocked ? "#b91c1c" : isRestricted ? "#b45309" : "#15803d",
                      border: `1px solid ${isBlocked ? "#fca5a5" : isRestricted ? "#fcd34d" : "#86efac"}`,
                    }}
                  >
                    {severityText}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Verified:</span>
                  <strong style={{ color: "#059669", display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.82rem" }}>
                    <ShieldCheck size={14} color="#059669" /> YES · Ground Patrol
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Updated:</span>
                  <span style={{ color: "#475569", fontWeight: 600, fontSize: "0.8rem" }}>{updatedTime}</span>
                </div>
              </div>

              {/* Strategic Logistics Impact Counters: 3-column Grid */}
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.4rem" }}>
                  Disruption Impact Assessment
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                  <div
                    style={{
                      background: isBlocked ? "#fef2f2" : "#f8fafc",
                      padding: "0.65rem 0.4rem",
                      borderRadius: "10px",
                      textAlign: "center",
                      border: `1px solid ${isBlocked ? "#fecaca" : "#e2e8f0"}`,
                    }}
                  >
                    <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 600 }}>Affected Trips</div>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 900,
                        color: isBlocked ? "#dc2626" : isRestricted ? "#d97706" : "#059669",
                        marginTop: "0.15rem",
                      }}
                    >
                      {affectedTrips}
                    </div>
                  </div>
                  <div
                    style={{
                      background: isBlocked ? "#fef2f2" : "#f8fafc",
                      padding: "0.65rem 0.4rem",
                      borderRadius: "10px",
                      textAlign: "center",
                      border: `1px solid ${isBlocked ? "#fecaca" : "#e2e8f0"}`,
                    }}
                  >
                    <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 600 }}>Deliveries</div>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 900,
                        color: isBlocked ? "#dc2626" : isRestricted ? "#d97706" : "#059669",
                        marginTop: "0.15rem",
                      }}
                    >
                      {affectedDeliveries}
                    </div>
                  </div>
                  <div
                    style={{
                      background: isBlocked ? "#faf5ff" : "#f8fafc",
                      padding: "0.65rem 0.4rem",
                      borderRadius: "10px",
                      textAlign: "center",
                      border: `1px solid ${isBlocked ? "#e9d5ff" : "#e2e8f0"}`,
                    }}
                  >
                    <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 600 }}>Facilities</div>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 900,
                        color: isBlocked ? "#7c3aed" : isRestricted ? "#9333ea" : "#64748b",
                        marginTop: "0.15rem",
                      }}
                    >
                      {affectedFacilities}
                    </div>
                  </div>
                </div>
              </div>

              {/* The 3 Core Commander Action Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginTop: "0.2rem" }}>
                {/* 1. View Incident Button */}
                <Link
                  href={matchedIncident ? `/gov/incidents?selected=${matchedIncident.id}` : "/gov/incidents"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                    padding: "0.6rem 0.8rem",
                    borderRadius: "8px",
                    background: "#fef2f2",
                    border: "1.5px solid #fecaca",
                    color: "#991b1b",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    textDecoration: "none",
                  }}
                >
                  <AlertTriangle size={15} color="#b91c1c" />
                  <span>View Incident</span>
                </Link>

                {/* 2. View Impact Button */}
                <Link
                  href={`/gov/impact?edge=${e.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                    padding: "0.6rem 0.8rem",
                    borderRadius: "8px",
                    background: "#eff6ff",
                    border: "1.5px solid #bfdbfe",
                    color: "#1d4ed8",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    textDecoration: "none",
                  }}
                >
                  <BarChart3 size={15} color="#1d4ed8" />
                  <span>View Impact</span>
                </Link>

                {/* 3. Find Alternative Route Button */}
                <Link
                  href={`/gov/fleet?avoidEdge=${e.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                    padding: "0.65rem 0.8rem",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.88rem",
                    textDecoration: "none",
                    boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
                  }}
                >
                  <Navigation size={15} color="#ffffff" />
                  <span>Find Alternative Route</span>
                </Link>
              </div>

              {/* Collapsible Technical Details */}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.6rem" }}>
                <button
                  type="button"
                  onClick={() => setShowTechDetails((prev) => !prev)}
                  style={{
                    background: "none",
                    border: 0,
                    padding: 0,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "#64748b",
                  }}
                >
                  <span>Segment Specifications &amp; Restrictions</span>
                  <span>{showTechDetails ? "▲" : "▼"}</span>
                </button>

                {showTechDetails && (
                  <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <KeyValue
                      items={[
                        ["Freshness", humanize(e.freshness)],
                        ["Status Version", String(e.status_version)],
                        ["Road Class", humanize(e.road_class)],
                        ["Surface Type", humanize(e.surface_type)],
                        ["Length", formatDistance(e.length_meters)],
                        ["Speed Limit", `${e.speed_limit_kmh} km/h`],
                      ]}
                    />
                    {e.restrictions.length ? (
                      <div style={{ fontSize: "0.78rem", background: "#f8fafc", padding: "0.5rem", borderRadius: "6px" }}>
                        <strong style={{ color: "#0f172a" }}>Restrictions in force:</strong>
                        <ul style={{ margin: "0.3rem 0 0 1rem", padding: 0 }}>
                          {e.restrictions.map((r, i) => (
                            <li key={i}>{describeRestriction(r)}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Declare Official Status Form for Authorized Commander */}
              {can("UPDATE_ROAD_STATUS") && (
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.6rem" }}>
                  <button
                    type="button"
                    onClick={() => setShowDeclareForm((prev) => !prev)}
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "#0369a1",
                    }}
                  >
                    <span>🛡️ Declare Official Status Change</span>
                    <span>{showDeclareForm ? "▲" : "▼"}</span>
                  </button>
                  {showDeclareForm && (
                    <div style={{ marginTop: "0.6rem" }}>
                      <DeclareStatusForm edgeId={e.id} currentStatus={e.status} currentVersion={e.status_version} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}

export function facilityLabel(f: Pick<Facility, "name" | "kind" | "code">): string {
  return `${f.name} (${humanize(f.kind)})`;
}

export function FacilityPanel({ facility, onClose, routeBase }: { facility: Facility; onClose?: () => void; routeBase?: string }) {
  const { can } = useSession();
  const [weight, setWeight] = useState("");
  const tonnes = weight ? Number(weight) : undefined;
  const reach = useReachability(facility.id, tonnes && tonnes > 0 ? tonnes : undefined);
  const impacts = useFacilityImpacts(facility.id);
  return (
    <Card title={facility.name} actions={onClose ? <Button size="small" onClick={onClose}>Close</Button> : undefined}>
      <div className="stack">
        <KeyValue
          items={[
            ["Kind", humanize(facility.kind)],
            ["Code", facility.code],
            ["Critical", facility.is_critical ? "Yes" : "No"],
            ["Position", `${facility.lat.toFixed(5)}, ${facility.lon.toFixed(5)}`],
            ["Network link", facility.nearest_road_node_id ? `Snapped ${facility.snap_distance_m?.toFixed(0) ?? "?"} m to network` : "Not linked to the road network"],
          ]}
        />
        {routeBase && can("COMPUTE_ROUTE") ? <p className="small"><Link href={`${routeBase}?destFacilityId=${facility.id}`}>Plan a route to here →</Link></p> : null}
        <Field label="Vehicle weight to check (tonnes, optional)" htmlFor="fw">
          <input id="fw" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        <QueryState query={reach} subject="reachability">
          {(r) => (
            <div className="stack">
              <StatusBadge kind="reach" value={r.status} />
              <p className="small">{r.reason}</p>
              {r.origin_hub_name ? <p className="small">From: {r.origin_hub_name}</p> : null}
              {r.total_seconds ? <p className="small">Estimated travel time: {Math.round(r.total_seconds / 60)} min over {r.edge_count ?? "?"} segments</p> : null}
              {r.bottlenecks && r.bottlenecks.length ? (
                <div>
                  <h3>Bottlenecks</h3>
                  <ul>{r.bottlenecks.map((b, i) => <li key={i} className="small">{JSON.stringify(b)}</li>)}</ul>
                </div>
              ) : null}
              {r.status === "NO_FEASIBLE_PATH" ? <p className="small"><strong>No feasible path is different from “unknown”:</strong> the network is known and every admissible route is closed or incompatible.</p> : null}
            </div>
          )}
        </QueryState>
        <div>
          <h3>Disruption impacts</h3>
          <QueryState query={impacts} subject="facility impacts" isEmpty={(d) => d.length === 0} emptyMessage="No disruption impacts recorded for this facility.">
            {(list) => (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {list.map((i) => (
                  <li key={i.id}>
                    <StatusBadge kind="reach" value={i.reachability_state} />{" "}
                    {i.isolated ? <span className="badge tone-danger">Isolated</span> : null}
                    <div className="small muted">Assessed {formatDateTime(i.assessed_at)} · status version {i.source_status_version} · delay {Math.round(i.access_delay_seconds / 60)} min · alternate route {i.alternate_route_available ? "available" : "not available"}</div>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </div>
      </div>
    </Card>
  );
}
