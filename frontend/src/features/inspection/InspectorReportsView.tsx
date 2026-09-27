"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useReports } from "@/features/incidents";
import { formatAge as formatRelativeTime } from "@/shared/lib/time";
import { Card, PageHeader } from "@/shared/ui";
import { Search } from "lucide-react";

export function InspectorReportsView() {
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  const reportsQuery = useReports();
  const reportsData = reportsQuery.data;

  const filtered = useMemo(() => {
    const list = reportsData ?? [];
    return list.filter((r) => {
      const matchesSearch =
        r.description.toLowerCase().includes(search.toLowerCase()) ||
        r.report_type.toLowerCase().includes(search.toLowerCase()) ||
        (r.candidate_edge_id && r.candidate_edge_id.toLowerCase().includes(search.toLowerCase()));

      const matchesFilter = filter === "ALL" || r.review_state === filter || r.severity === filter;
      return matchesSearch && matchesFilter;
    });
  }, [reportsData, search, filter]);

  return (
    <div className="stack" style={{ gap: "1.5rem", maxWidth: "1080px", margin: "0 auto", paddingBottom: "3rem" }}>
      <PageHeader
        title="Ground Patrol Observations"
        subtitle="Live incident reports and photographic evidence submitted by patrolling field officers across NH-6 / NH-27."
      />

      {/* Filter and Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {["ALL", "PROVISIONAL_CAUTION", "SUBMITTED", "VERIFIED", "CRITICAL"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "8px",
                border: "none",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
                backgroundColor: filter === f ? "#0f172a" : "var(--color-surface-sunken, #f1f5f9)",
                color: filter === f ? "#ffffff" : "#64748b",
              }}
            >
              {f === "ALL" ? "All Reports" : f.replace("_", " ")}
            </button>
          ))}
        </div>

        <div style={{ position: "relative", minWidth: "260px" }}>
          <Search size={16} style={{ position: "absolute", left: "10px", top: "10px", color: "var(--color-text-muted, #94a3b8)" }} />
          <input
            type="text"
            placeholder="Search report observations..."
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

      {/* Reports List */}
      {reportsQuery.isLoading ? (
        <Card>
          <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--color-text-muted)" }}>
            Loading ground patrol observations...
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <span style={{ fontSize: "2rem" }}>📝</span>
            <h4 style={{ margin: "0.5rem 0 0.2rem 0", fontWeight: 700 }}>No Patrol Reports Found</h4>
            <p className="small muted">No ground reports match your active filter.</p>
          </div>
        </Card>
      ) : (
        <div className="stack" style={{ gap: "0.85rem" }}>
          {filtered.map((r) => {
            const isCritical = r.severity === "CRITICAL";
            const isCaution = r.review_state === "PROVISIONAL_CAUTION";

            return (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                  padding: "1.1rem 1.35rem",
                  borderRadius: "12px",
                  background: "var(--color-surface, #ffffff)",
                  border: isCaution
                    ? "1px solid #fde68a"
                    : isCritical
                    ? "1px solid #fecaca"
                    : "1px solid var(--color-border, #e2e8f0)",
                  borderLeft: isCritical
                    ? "5px solid #dc2626"
                    : isCaution
                    ? "5px solid #f59e0b"
                    : "5px solid #0284c7",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ flex: 1, minWidth: "280px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        padding: "0.15rem 0.45rem",
                        borderRadius: "4px",
                        backgroundColor: isCritical ? "#fee2e2" : "#ffedd5",
                        color: isCritical ? "#991b1b" : "#9a3412",
                      }}
                    >
                      {r.severity}
                    </span>
                    <span className="badge small">{r.report_type}</span>
                    <span className="badge small">{r.review_state}</span>
                    {r.candidate_edge_id && (
                      <span className="mono small muted">Edge: {r.candidate_edge_id}</span>
                    )}
                  </div>

                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
                    &ldquo;{r.description}&rdquo;
                  </h3>

                  <div className="small muted" style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                    <span>Reported {formatRelativeTime(r.created_at)}</span>
                    {r.media_ids.length > 0 && <span>📷 {r.media_ids.length} photos attached</span>}
                    {r.location && (
                      <span>
                        📍 {r.location.latitude.toFixed(4)}°N, {r.location.longitude.toFixed(4)}°E
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <Link href={`/inspector/inspections?reportId=${r.id}`} className="btn small secondary">
                    View Associated Inspections &rarr;
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
