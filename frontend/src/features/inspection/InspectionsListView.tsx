"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatAge as formatRelativeTime } from "@/shared/lib/time";
import { Card, PageHeader } from "@/shared/ui";
import { useInspections } from "./queries";
import type { InspectionStatus } from "./types";
import { Play, Search } from "lucide-react";

export function InspectionsListView() {
  const [tab, setTab] = useState<InspectionStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const inspectionsQuery = useInspections(tab);
  const items = inspectionsQuery.data;

  const filtered = useMemo(() => {
    const list = items ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (i) =>
        i.instructions.toLowerCase().includes(q) ||
        (i.candidate_edge_id && i.candidate_edge_id.toLowerCase().includes(q)) ||
        (i.final_decision && i.final_decision.toLowerCase().includes(q)),
    );
  }, [items, search]);

  const tabs: { key: InspectionStatus | "ALL"; label: string; icon: string }[] = [
    { key: "ALL", label: "All Tasks", icon: "📋" },
    { key: "ASSIGNED", label: "Assigned", icon: "⏳" },
    { key: "IN_PROGRESS", label: "In Progress", icon: "🚧" },
    { key: "COMPLETED", label: "Completed", icon: "✅" },
    { key: "REINSPECTION_REQUIRED", label: "Recheck Needed", icon: "⚠️" },
  ];

  return (
    <div className="stack" style={{ gap: "1.5rem", maxWidth: "1080px", margin: "0 auto", paddingBottom: "3rem" }}>
      <PageHeader
        title="Infrastructure Inspection Missions"
        subtitle="Authoritative structural and damage assessments dispatched by Regional & District Command."
      />

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div
          role="tablist"
          style={{
            display: "flex",
            gap: "0.35rem",
            background: "var(--color-surface-sunken, #f1f5f9)",
            padding: "0.3rem",
            borderRadius: "10px",
            flexWrap: "wrap",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.5rem 0.85rem",
                borderRadius: "8px",
                border: "none",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
                backgroundColor: tab === t.key ? "white" : "transparent",
                color: tab === t.key ? "#0f172a" : "#64748b",
                boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div style={{ position: "relative", minWidth: "260px" }}>
          <Search size={16} style={{ position: "absolute", left: "10px", top: "10px", color: "var(--color-text-muted, #94a3b8)" }} />
          <input
            type="text"
            placeholder="Filter by corridor or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "0.5rem 0.75rem 0.5rem 2rem",
              borderRadius: "8px",
              border: "1px solid var(--color-border, #cbd5e1)",
              width: "100%",
              fontSize: "0.85rem",
            }}
          />
        </div>
      </div>

      {/* Inspections Grid / List */}
      {inspectionsQuery.isLoading ? (
        <Card>
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
            Loading inspection missions from database...
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div style={{ padding: "3rem 1rem", textAlign: "center" }}>
            <span style={{ fontSize: "2rem" }}>🔍</span>
            <h4 style={{ margin: "0.5rem 0 0.2rem 0", fontWeight: 700 }}>No Inspections Found</h4>
            <p className="small muted">No tasks matching the selected filter in your designated corridor.</p>
          </div>
        </Card>
      ) : (
        <div className="stack" style={{ gap: "0.85rem" }}>
          {filtered.map((insp) => {
            const isCompleted = insp.status === "COMPLETED";
            const isInProgress = insp.status === "IN_PROGRESS";
            const isRecheck = insp.status === "REINSPECTION_REQUIRED";

            return (
              <div
                key={insp.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                  padding: "1.1rem 1.35rem",
                  borderRadius: "12px",
                  background: "var(--color-surface, #ffffff)",
                  border: isCompleted
                    ? "1px solid #d1fae5"
                    : isRecheck
                    ? "1px solid #fecaca"
                    : isInProgress
                    ? "1px solid #bfdbfe"
                    : "1px solid var(--color-border, #e2e8f0)",
                  borderLeft: isCompleted
                    ? "5px solid #10b981"
                    : isRecheck
                    ? "5px solid #ef4444"
                    : isInProgress
                    ? "5px solid #3b82f6"
                    : "5px solid #f59e0b",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ flex: 1, minWidth: "280px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "0.15rem 0.45rem",
                        borderRadius: "4px",
                        backgroundColor:
                          insp.priority === "CRITICAL"
                            ? "#dc2626"
                            : insp.priority === "HIGH"
                            ? "#ea580c"
                            : "#0284c7",
                        color: "#ffffff",
                      }}
                    >
                      {insp.priority}
                    </span>

                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "0.15rem 0.45rem",
                        borderRadius: "4px",
                        backgroundColor: isCompleted
                          ? "#ecfdf5"
                          : isRecheck
                          ? "#fef2f2"
                          : isInProgress
                          ? "#eff6ff"
                          : "#fffbeb",
                        color: isCompleted
                          ? "#065f46"
                          : isRecheck
                          ? "#991b1b"
                          : isInProgress
                          ? "#1e40af"
                          : "#92400e",
                      }}
                    >
                      {insp.status}
                    </span>

                    {insp.candidate_edge_id && (
                      <span className="mono small" style={{ fontWeight: 600, color: "var(--color-primary-dark, #0284c7)" }}>
                        📍 {insp.candidate_edge_id}
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
                    {insp.instructions || "On-site corridor structural inspection"}
                  </h3>

                  <div className="small muted" style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                    <span>Dispatched {formatRelativeTime(insp.created_at)}</span>
                    {insp.evidence && insp.evidence.length > 0 && (
                      <span>📷 {insp.evidence.length} evidence photos</span>
                    )}
                    {insp.final_decision && (
                      <span style={{ fontWeight: 700, color: insp.final_decision.includes("CLEAR") ? "#059669" : "#dc2626" }}>
                        Outcome: {insp.final_decision}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <Link
                    href={`/inspector/inspections/${insp.id}`}
                    className={`btn small ${isInProgress ? "primary" : "secondary"}`}
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    {isInProgress ? <Play size={14} /> : null}
                    {isInProgress ? "Continue Inspection" : isCompleted ? "View Dossier" : "Review & Start"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
