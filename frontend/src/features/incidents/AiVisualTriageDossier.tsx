"use client";

import { useState } from "react";
import { useAutoTriageReport } from "@/features/ai";
import { Banner, Button, Card, ErrorNotice, StatusBadge } from "@/shared/ui";
import type { Report, VerifyPhotoResponse } from "@/shared/api";

interface ReportWithCv extends Report {
  cv_hazard_class?: string | null;
  cv_confidence?: number | null;
  cv_is_roadway_blocked?: boolean | null;
  cv_verified_at?: string | null;
}

interface Props {
  report: Report;
  onApplyRecommendation?: (rec: {
    decision: "CONFIRM_INCIDENT";
    incidentTitle: string;
    isFullClosure: boolean;
  }) => void;
}

export function AiVisualTriageDossier({ report, onApplyRecommendation }: Props) {
  const autoTriage = useAutoTriageReport();
  const [liveResult, setLiveResult] = useState<VerifyPhotoResponse | null>(null);

  const r = report as ReportWithCv;
  const hasPhoto = r.media_ids && r.media_ids.length > 0;
  const cvVerified = Boolean(r.cv_verified_at) || liveResult !== null;
  const hazardClass = liveResult?.hazard_class ?? r.cv_hazard_class ?? "NOT_TRIAGED";
  const confidence = liveResult?.confidence ?? r.cv_confidence ?? 0;
  const isBlocked = liveResult?.is_roadway_blocked ?? r.cv_is_roadway_blocked ?? false;

  const handleRunTriage = async () => {
    try {
      const res = await autoTriage.mutateAsync({ report_id: report.id });
      setLiveResult(res);
    } catch {
      // Handled by mutation error state
    }
  };

  const handleApply = () => {
    if (onApplyRecommendation) {
      onApplyRecommendation({
        decision: "CONFIRM_INCIDENT",
        incidentTitle: `Landslide Hazard confirmed via AI CV (${hazardClass})`,
        isFullClosure: isBlocked,
      });
    }
  };

  if (!hasPhoto) {
    return (
      <Card title="🤖 AI Computer Vision Triage">
        <p className="small muted">No photo evidence attached to this report. Automated CV triage requires at least one field photograph.</p>
      </Card>
    );
  }

  return (
    <Card title="🤖 AI Computer Vision Triage Dossier (YOLOv8m ONNX)">
      <div className="stack" style={{ gap: "0.75rem" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontWeight: 600 }}>
              Assessment: {isBlocked ? "🚨 ROADWAY BLOCKED / HAZARD CONFIRMED" : cvVerified ? "⚠️ HAZARD DETECTED" : "PENDING CV INFERENCE"}
            </span>
          </div>
          <StatusBadge kind="access" value={isBlocked ? "BLOCKED" : "OPEN"} />
        </div>

        <div className="grid cols-3" style={{ background: "rgba(255,255,255,0.02)", padding: "0.75rem", borderRadius: 8 }}>
          <div>
            <span className="small muted">Identified Hazard:</span>
            <p style={{ margin: "0.2rem 0", fontWeight: 600 }}>{hazardClass.replace(/_/g, " ")}</p>
          </div>
          <div>
            <span className="small muted">Model Confidence:</span>
            <p style={{ margin: "0.2rem 0", fontWeight: 600 }}>{(confidence * 100).toFixed(1)}%</p>
          </div>
          <div>
            <span className="small muted">Road Impact:</span>
            <p style={{ margin: "0.2rem 0", fontWeight: 600, color: isBlocked ? "#ef4444" : "#22c55e" }}>
              {isBlocked ? "FULL BLOCKAGE DETECTED" : "PARTIAL / MONITORING"}
            </p>
          </div>
        </div>

        {autoTriage.isError ? (
          <ErrorNotice error={autoTriage.error} subject="automated triage execution" />
        ) : null}

        <div className="row" style={{ gap: "0.75rem", marginTop: "0.5rem" }}>
          {!cvVerified ? (
            <Button variant="primary" onClick={handleRunTriage} busy={autoTriage.isPending}>
              ⚡ Run AI Auto-Triage on Photo
            </Button>
          ) : null}

          {onApplyRecommendation && cvVerified ? (
            <Button variant="primary" onClick={handleApply}>
              ✅ Apply AI Recommendations to Decision Form
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
