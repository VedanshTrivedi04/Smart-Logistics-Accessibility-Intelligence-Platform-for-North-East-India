"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useEdges } from "@/features/network";
import { Card, PageHeader } from "@/shared/ui";
import { useInspections } from "./queries";
import { Search } from "lucide-react";

export function RoadAssessmentView() {
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  // Bounding box for key NER highway corridors
  const edgesQuery = useEdges([91.5, 25.5, 93.5, 26.5], 12);
  const inspectionsQuery = useInspections("ALL");

  const edgesData = edgesQuery.data?.features;
  const inspectionsData = inspectionsQuery.data;

  const assessments = useMemo(() => {
    const edges = edgesData ?? [];
    const inspections = inspectionsData ?? [];
    return edges.map((feat) => {
      const edgeId = feat.id;
      const matching = inspections
        .filter((i) => i.candidate_edge_id === edgeId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const latestInspection = matching.length > 0 ? matching[0] : null;

      return {
        edgeId,
        roadName: feat.props.road_name || "National Highway Corridor",
        highwayClass: feat.props.road_class || "PRIMARY",
        currentStatus: feat.props.accessibility_status,
        lengthKm: (feat.props.length_meters / 1000).toFixed(2),
        latestInspection,
      };
    });
  }, [edgesData, inspectionsData]);

  const filtered = useMemo(() => {
    return assessments.filter((a) => {
      const matchesSearch =
        a.roadName.toLowerCase().includes(search.toLowerCase()) ||
        a.edgeId.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === "ALL" || a.currentStatus === filter;
      return matchesSearch && matchesFilter;
    });
  }, [assessments, search, filter]);

  return (
    <div className="stack" style={{ gap: "1.5rem", maxWidth: "1080px", margin: "0 auto", paddingBottom: "3rem" }}>
      <PageHeader
        title="Road Infrastructure &amp; Structural Assessment"
        subtitle="Network-wide structural integrity, corridor closures, and re-inspection tracking across North-East lifelines."
      />

      {/* Filter and Search Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {["ALL", "BLOCKED", "RESTRICTED", "OPEN"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilter(st)}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "8px",
                border: "none",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
                backgroundColor: filter === st ? "#0f172a" : "var(--color-surface-sunken, #f1f5f9)",
                color: filter === st ? "#ffffff" : "#64748b",
              }}
            >
              {st === "ALL" ? "All Corridors" : st}
            </button>
          ))}
        </div>

        <div style={{ position: "relative", minWidth: "260px" }}>
          <Search size={16} style={{ position: "absolute", left: "10px", top: "10px", color: "var(--color-text-muted, #94a3b8)" }} />
          <input
            type="text"
            placeholder="Search highway or segment ID..."
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

      {/* Corridors Grid */}
      <div className="stack" style={{ gap: "0.85rem" }}>
        {filtered.length === 0 ? (
          <Card>
            <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
              <span style={{ fontSize: "2rem" }}>🛣️</span>
              <h4 style={{ margin: "0.5rem 0 0.2rem 0", fontWeight: 700 }}>No Highway Corridors Found</h4>
              <p className="small muted">No road segments match the filter query in the active spatial database.</p>
            </div>
          </Card>
        ) : (
          filtered.map((item) => {
            const isBlocked = item.currentStatus === "BLOCKED";
            const isRestricted = item.currentStatus === "RESTRICTED";

            return (
              <div
                key={item.edgeId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                  padding: "1.1rem 1.35rem",
                  borderRadius: "12px",
                  background: "var(--color-surface, #ffffff)",
                  border: isBlocked ? "1px solid #fecaca" : isRestricted ? "#fde68a" : "1px solid var(--color-border, #e2e8f0)",
                  borderLeft: isBlocked ? "5px solid #dc2626" : isRestricted ? "5px solid #d97706" : "5px solid #059669",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.03)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        padding: "0.15rem 0.45rem",
                        borderRadius: "4px",
                        backgroundColor: isBlocked ? "#fee2e2" : isRestricted ? "#fef3c7" : "#d1fae5",
                        color: isBlocked ? "#991b1b" : isRestricted ? "#92400e" : "#065f46",
                      }}
                    >
                      {item.currentStatus}
                    </span>
                    <span className="mono small font-bold" style={{ fontWeight: 700 }}>
                      {item.edgeId}
                    </span>
                    <span className="badge small">{item.highwayClass}</span>
                  </div>

                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
                    {item.roadName} · Section Length: {item.lengthKm} km
                  </h3>

                  <div className="small muted" style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                    {item.latestInspection ? (
                      <span>
                        Last Inspected: <strong>{item.latestInspection.status}</strong> (
                        {item.latestInspection.final_decision || "In Assessment"})
                      </span>
                    ) : (
                      <span>No recorded engineering inspection</span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {item.latestInspection ? (
                    <Link href={`/inspector/inspections/${item.latestInspection.id}`} className="btn small secondary">
                      View Last Dossier &rarr;
                    </Link>
                  ) : (
                    <Link href="/inspector/inspections" className="btn small secondary">
                      Schedule Inspection
                    </Link>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
