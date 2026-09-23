"use client";

import { Search, X, MapPin, AlertTriangle, Truck, Package } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useFacilities } from "@/features/network";
import { useIncidents } from "@/features/incidents";
import { useVehicles, useCommitments } from "@/features/fleet";
import { humanize } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/ui";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const facilities = useFacilities();
  const incidents = useIncidents();
  const vehicles = useVehicles();
  const commitments = useCommitments();

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return null;

    const matchedFacilities = (facilities.data ?? []).filter(
      (f) => f.name.toLowerCase().includes(q) || f.code.toLowerCase().includes(q) || f.kind.toLowerCase().includes(q)
    ).slice(0, 5);

    const matchedIncidents = (incidents.data ?? []).filter(
      (i) => i.title.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q) || i.severity.toLowerCase().includes(q)
    ).slice(0, 5);

    const matchedVehicles = (vehicles.data ?? []).filter(
      (v) => v.registration_number.toLowerCase().includes(q) || v.vehicle_type.toLowerCase().includes(q) || (v.make_model ?? "").toLowerCase().includes(q)
    ).slice(0, 5);

    const matchedCommitments = (commitments.data ?? []).filter(
      (c) => c.consignment_reference.toLowerCase().includes(q) || c.cargo_category.toLowerCase().includes(q)
    ).slice(0, 5);

    const count = matchedFacilities.length + matchedIncidents.length + matchedVehicles.length + matchedCommitments.length;

    return {
      facilities: matchedFacilities,
      incidents: matchedIncidents,
      vehicles: matchedVehicles,
      commitments: matchedCommitments,
      count,
    };
  }, [q, facilities.data, incidents.data, vehicles.data, commitments.data]);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(true)}
        className="btn"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.35rem 0.75rem",
          fontSize: "0.85rem",
          backgroundColor: "var(--color-surface, #f8fafc)",
          border: "1px solid var(--color-border, #cbd5e1)",
          borderRadius: "0.5rem",
          color: "var(--color-muted, #64748b)",
          cursor: "pointer",
        }}
        title="Search platform (Ctrl+K)"
      >
        <Search size={14} />
        <span>Search entity or asset…</span>
        <kbd style={{ fontSize: "0.7rem", padding: "0.1rem 0.3rem", backgroundColor: "#e2e8f0", borderRadius: "3px" }}>⌘K</kbd>
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "12vh",
            zIndex: 1000,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "620px",
              maxHeight: "75vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              overflow: "hidden",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              borderRadius: "0.75rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.9rem 1.2rem",
                borderBottom: "1px solid var(--color-border, #e2e8f0)",
                backgroundColor: "var(--color-surface, #ffffff)",
              }}
            >
              <Search size={18} style={{ color: "#64748b" }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by road (NH-6, NH-27), hospital, incident, vehicle, or cargo…"
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  fontSize: "1rem",
                  color: "var(--color-text, #0f172a)",
                  backgroundColor: "transparent",
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Results Body */}
            <div style={{ padding: "1rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {!q && (
                <div className="stack" style={{ gap: "0.5rem", color: "#64748b", padding: "1rem 0" }}>
                  <p className="small muted">Quick suggestions for North-East corridor:</p>
                  <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                    {["Oxygen Plant", "NEIGRIHMS", "Landslide", "NH-6", "Tanker", "Vaccine"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setQuery(s)}
                        className="btn small"
                        style={{ fontSize: "0.78rem" }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results && results.count === 0 && (
                <p className="muted" style={{ padding: "1.5rem", textAlign: "center" }}>
                  No assets or incidents matching “{query}”.
                </p>
              )}

              {results && results.incidents.length > 0 && (
                <div>
                  <div className="small muted" style={{ fontWeight: 700, textTransform: "uppercase", marginBottom: "0.4rem" }}>
                    Incidents ({results.incidents.length})
                  </div>
                  <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.35rem" }}>
                    {results.incidents.map((i) => (
                      <li key={i.id}>
                        <Link
                          href={`/gov/incidents/${i.id}`}
                          onClick={() => setOpen(false)}
                          className="row card"
                          style={{ padding: "0.5rem 0.75rem", gap: "0.6rem", textDecoration: "none", alignItems: "center" }}
                        >
                          <AlertTriangle size={15} style={{ color: "#ef4444" }} />
                          <div style={{ flex: 1 }}>
                            <strong style={{ fontSize: "0.9rem" }}>{i.title}</strong>
                            <span className="small muted" style={{ display: "block" }}>{i.description?.slice(0, 60)}…</span>
                          </div>
                          <StatusBadge kind="severity" value={i.severity} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {results && results.facilities.length > 0 && (
                <div>
                  <div className="small muted" style={{ fontWeight: 700, textTransform: "uppercase", marginBottom: "0.4rem" }}>
                    Critical Facilities ({results.facilities.length})
                  </div>
                  <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.35rem" }}>
                    {results.facilities.map((f) => (
                      <li key={f.id}>
                        <Link
                          href="/gov/map"
                          onClick={() => setOpen(false)}
                          className="row card"
                          style={{ padding: "0.5rem 0.75rem", gap: "0.6rem", textDecoration: "none", alignItems: "center" }}
                        >
                          <MapPin size={15} style={{ color: "#0284c7" }} />
                          <div style={{ flex: 1 }}>
                            <strong style={{ fontSize: "0.9rem" }}>{f.name}</strong>
                            <span className="small muted" style={{ display: "block" }}>{humanize(f.kind)} · {f.code}</span>
                          </div>
                          {f.is_critical && (
                            <span style={{ fontSize: "0.72rem", backgroundColor: "#fee2e2", color: "#991b1b", padding: "0.1rem 0.4rem", borderRadius: "3px", fontWeight: 700 }}>
                              CRITICAL
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {results && results.vehicles.length > 0 && (
                <div>
                  <div className="small muted" style={{ fontWeight: 700, textTransform: "uppercase", marginBottom: "0.4rem" }}>
                    Fleet Vehicles ({results.vehicles.length})
                  </div>
                  <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.35rem" }}>
                    {results.vehicles.map((v) => (
                      <li key={v.id}>
                        <Link
                          href={`/gov/fleet/vehicles/${v.id}`}
                          onClick={() => setOpen(false)}
                          className="row card"
                          style={{ padding: "0.5rem 0.75rem", gap: "0.6rem", textDecoration: "none", alignItems: "center" }}
                        >
                          <Truck size={15} style={{ color: "#10b981" }} />
                          <div style={{ flex: 1 }}>
                            <strong style={{ fontSize: "0.9rem" }}>{v.registration_number}</strong>
                            <span className="small muted" style={{ display: "block" }}>{humanize(v.vehicle_type)} · {v.make_model ?? "Standard Heavy"}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {results && results.commitments.length > 0 && (
                <div>
                  <div className="small muted" style={{ fontWeight: 700, textTransform: "uppercase", marginBottom: "0.4rem" }}>
                    Consignments ({results.commitments.length})
                  </div>
                  <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.35rem" }}>
                    {results.commitments.map((c) => (
                      <li key={c.id}>
                        <Link
                          href="/gov/fleet"
                          onClick={() => setOpen(false)}
                          className="row card"
                          style={{ padding: "0.5rem 0.75rem", gap: "0.6rem", textDecoration: "none", alignItems: "center" }}
                        >
                          <Package size={15} style={{ color: "#8b5cf6" }} />
                          <div style={{ flex: 1 }}>
                            <strong style={{ fontSize: "0.9rem" }}>{c.consignment_reference}</strong>
                            <span className="small muted" style={{ display: "block" }}>{humanize(c.cargo_category)} · {humanize(c.priority_tier)}</span>
                          </div>
                          <StatusBadge kind="sla" value={c.sla_status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "0.6rem 1rem",
                borderTop: "1px solid var(--color-border, #e2e8f0)",
                backgroundColor: "#f8fafc",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.78rem",
                color: "#64748b",
              }}
            >
              <span>Press ESC to close</span>
              <span>PARVA Cross-Portal Entity Index</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
