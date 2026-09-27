"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Banner, Field } from "@/shared/ui";
import { useAssignInspection, useAvailableInspectors } from "./queries";
import type { InspectionPriority } from "./types";
import { Send, X } from "lucide-react";

interface AssignInspectionModalProps {
  reportId?: string | null;
  candidateEdgeId?: string | null;
  incidentId?: string | null;
  jurisdictionId?: string | null;
  defaultInstructions?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AssignInspectionModal({
  reportId,
  candidateEdgeId,
  incidentId,
  jurisdictionId,
  defaultInstructions = "",
  isOpen,
  onClose,
  onSuccess,
}: AssignInspectionModalProps) {
  const assignMutation = useAssignInspection();
  const inspectorsQuery = useAvailableInspectors();

  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<InspectionPriority>("HIGH");
  const [instructions, setInstructions] = useState(defaultInstructions);
  const [error, setError] = useState<string | null>(null);

  // Default to the only (or first) available inspector once the roster loads, without overriding
  // a choice the coordinator already made.
  useEffect(() => {
    const first = inspectorsQuery.data?.[0];
    if (!assignedTo && first) setAssignedTo(first.user_id);
  }, [assignedTo, inspectorsQuery.data]);

  if (!isOpen) return null;

  // This report has no jurisdiction on record; the backend requires a real one, so dispatch is
  // blocked here rather than silently sending a placeholder that the server would reject anyway.
  const missingJurisdiction = !jurisdictionId;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (missingJurisdiction) return setError("This report has no jurisdiction on record; an inspector cannot be dispatched until it does.");
    if (!assignedTo) return setError("Choose an inspector to dispatch.");
    try {
      await assignMutation.mutateAsync({
        assigned_to: assignedTo,
        jurisdiction_id: jurisdictionId,
        priority,
        instructions: instructions || "Conduct visual damage check and record passability status.",
        report_id: reportId,
        candidate_edge_id: candidateEdgeId,
        incident_id: incidentId,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign inspection task");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "var(--color-surface, #ffffff)",
          borderRadius: "16px",
          maxWidth: "540px",
          width: "100%",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.3)",
          border: "1px solid var(--color-border, #e2e8f0)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #1e1b4b 0%, #311042 100%)",
            color: "#ffffff",
            padding: "1.25rem 1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.2rem" }}>🔬</span>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
              Dispatch Road &amp; Infrastructure Inspector
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "1.5rem" }} className="stack">
          {error && (
            <Banner tone="danger" title="Assignment Error">
              <p className="small">{error}</p>
            </Banner>
          )}

          {missingJurisdiction && (
            <Banner tone="warn" title="No jurisdiction on record">
              <p className="small">This report has no jurisdiction assigned, so an inspector cannot be dispatched for it yet.</p>
            </Banner>
          )}

          <Field label="Designated Inspector">
            {inspectorsQuery.isLoading ? (
              <p className="small muted">Loading available inspectors…</p>
            ) : inspectorsQuery.isError ? (
              <p className="small muted">Could not load the inspector roster.</p>
            ) : !inspectorsQuery.data || inspectorsQuery.data.length === 0 ? (
              <p className="small muted">No inspectors are currently available to dispatch.</p>
            ) : (
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                style={{ width: "100%", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--color-border)" }}
              >
                {inspectorsQuery.data.map((i) => (
                  <option key={i.user_id} value={i.user_id}>
                    {i.display_name} ({i.org_name})
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Inspection Priority Level">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as InspectionPriority)}
              style={{ width: "100%", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--color-border)" }}
            >
              <option value="CRITICAL">CRITICAL — Immediate Emergency Hazard (Lifeline Disrupted)</option>
              <option value="HIGH">HIGH — Severe Obstruction / Landslide / Flood Caution</option>
              <option value="MEDIUM">MEDIUM — Structural Monitoring / Debris Check</option>
              <option value="LOW">LOW — Routine Verification</option>
            </select>
          </Field>

          <Field label="Field Instructions &amp; Engineering Directives">
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Inspect bridge pier 3 scour after flood surge. Measure clearance width and declare passability."
              style={{ width: "100%", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: "0.9rem" }}
            />
          </Field>

          <div className="small muted" style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            {candidateEdgeId && <div>Target Corridor: <strong>{candidateEdgeId}</strong></div>}
            {reportId && <div>Source Observation: <strong>{reportId.slice(0, 8)}</strong></div>}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
            <button type="button" onClick={onClose} className="btn secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={assignMutation.isPending || missingJurisdiction || !assignedTo}
              className="btn primary"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Send size={16} /> {assignMutation.isPending ? "Dispatching..." : "Dispatch Inspection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
