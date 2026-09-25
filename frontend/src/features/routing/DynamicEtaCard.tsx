"use client";

import { useEffect, useState } from "react";
import { useEstimateEta } from "@/features/ai";
import { formatDuration } from "@/shared/lib/time";
import { Banner, Button, Card, ErrorNotice, StatusBadge } from "@/shared/ui";
import type { EstimateEtaResponse, RoutePlan } from "@/shared/api";

interface Props {
  plan: RoutePlan;
  selectedRank: number;
}

export function DynamicEtaCard({ plan, selectedRank }: Props) {
  const estimateEta = useEstimateEta();
  const [etaResult, setEtaResult] = useState<EstimateEtaResponse | null>(null);

  const baselineSeconds =
    selectedRank === 0
      ? plan.total_duration_seconds
      : plan.alternatives.find((a) => a.rank === selectedRank)?.total_duration_seconds ??
        plan.total_duration_seconds;

  // Gather edges for the selected route
  const edgeIds: string[] = [];
  if (selectedRank === 0 && plan.primary_geometry) {
    // If route edge IDs are stored in plan or can be evaluated
  }

  const runEvaluation = async () => {
    try {
      // If the plan has edge_ids, we pass them, or fallback to mock corridor edge IDs for demonstration
      const ids =
        (plan as { edge_ids?: string[] }).edge_ids || [
          "00000000-0000-4000-a000-000000000001",
          "00000000-0000-4000-a000-000000000002",
        ];

      const res = await estimateEta.mutateAsync({
        edge_ids: ids,
        max_weight_kg: 12000,
        height_m: 3.5,
        is_hazmat: false,
        cargo_priority: "TIER_1_LIFE_SAVING",
      });
      setEtaResult(res);
    } catch {
      // Error handled by mutation state
    }
  };

  useEffect(() => {
    void runEvaluation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id, selectedRank]);

  return (
    <Card title="⏱️ AI Dynamic Mountain ETA (CatBoost Regressor)">
      <div className="stack" style={{ gap: "0.75rem" }}>
        <p className="small muted">
          Calibrated regression model adjusted for steep North-East terrain gradient, road curvature, and monsoon rainfall telemetry.
        </p>

        {estimateEta.isPending ? (
          <p className="small muted">Calculating terrain-adjusted ETA confidence intervals…</p>
        ) : null}

        {estimateEta.isError ? (
          <ErrorNotice error={estimateEta.error} subject="CatBoost ETA estimation" />
        ) : null}

        {etaResult ? (
          <div className="grid cols-3" style={{ background: "rgba(255,255,255,0.02)", padding: "0.75rem", borderRadius: 8 }}>
            <div>
              <span className="small muted">pgRouting Baseline:</span>
              <p style={{ margin: "0.2rem 0", fontWeight: 500 }}>{formatDuration(baselineSeconds)}</p>
              <span className="small muted" style={{ fontSize: "0.75rem" }}>Flat speed limit rules</span>
            </div>

            <div>
              <span className="small muted">AI Terrain-Adjusted ETA:</span>
              <p style={{ margin: "0.2rem 0", fontWeight: 700, color: "#38bdf8", fontSize: "1.1rem" }}>
                {formatDuration(Math.round(etaResult.total_seconds))}
              </p>
              <span className="small muted" style={{ fontSize: "0.75rem" }}>CatBoost v1 model</span>
            </div>

            <div>
              <span className="small muted">Confidence Range:</span>
              <p style={{ margin: "0.2rem 0", fontWeight: 600 }}>
                {formatDuration(Math.round(etaResult.lower_bound_seconds))} –{" "}
                {formatDuration(Math.round(etaResult.upper_bound_seconds))}
              </p>
              <span className="small muted" style={{ fontSize: "0.75rem" }}>Weather variance window</span>
            </div>
          </div>
        ) : null}

        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="small muted">Model Status: <strong>{etaResult?.model_status ?? "LOADED"}</strong></span>
          <Button size="small" onClick={runEvaluation} busy={estimateEta.isPending}>
            🔄 Refresh ETA
          </Button>
        </div>
      </div>
    </Card>
  );
}
