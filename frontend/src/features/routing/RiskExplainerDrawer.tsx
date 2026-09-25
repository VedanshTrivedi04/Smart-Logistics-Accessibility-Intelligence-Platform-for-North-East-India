"use client";

import { useState } from "react";
import { useEdgeRiskQuery, usePredictRisk } from "@/features/ai";
import { Banner, Button, Card, ErrorNotice, Field, StatusBadge } from "@/shared/ui";
import type { PredictRiskResponse } from "@/shared/api";

interface Props {
  edgeId: string | null;
  edgeLabel?: string;
  onClose: () => void;
}

export function RiskExplainerDrawer({ edgeId, edgeLabel, onClose }: Props) {
  const [horizon, setHorizon] = useState<"H24" | "H72">("H24");
  const riskQuery = useEdgeRiskQuery(edgeId, horizon === "H72" ? "H24" : horizon);
  const predictCustom = usePredictRisk();
  const [customResult, setCustomResult] = useState<PredictRiskResponse | null>(null);

  const data = customResult ?? riskQuery.data;
  const isHighRisk = (data?.probability ?? 0) >= 0.65;
  const isMedRisk = (data?.probability ?? 0) >= 0.35 && (data?.probability ?? 0) < 0.65;

  const testHighRainfallScenario = async () => {
    if (!edgeId) return;
    try {
      const res = await predictCustom.mutateAsync({
        edge_id: edgeId,
        horizon: "H24",
        features: {
          slope_pct: 42.5,
          elevation_mean_m: 1420.0,
          curvature_index: 8.5,
          rainfall_72h_mm: 215.0,
          ari_score: 110.0,
          soil_moisture_index: 0.58,
        },
      });
      setCustomResult(res);
    } catch {
      // Error handled by predictCustom.isError
    }
  };

  const resetToDbTelemetry = () => {
    setCustomResult(null);
  };

  if (!edgeId) return null;

  return (
    <Card title="⛰️ AI Road Disruption Risk & SHAP Explainability (XGBoost)">
      <div className="stack" style={{ gap: "1rem" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h4 style={{ margin: 0 }}>{edgeLabel ?? `Road Edge ${edgeId.slice(0, 8)}…`}</h4>
            <span className="small muted">Evaluated from real NASA Landslide Catalog + Open-Meteo Weather Store</span>
          </div>
          <Button size="small" onClick={onClose}>✕ Close</Button>
        </div>

        {riskQuery.isPending && !customResult ? (
          <p className="small muted">Loading road edge terrain features & computing SHAP values…</p>
        ) : null}

        {riskQuery.isError && !customResult ? (
          <div>
            <p className="small muted">Live feature store entry for this segment is pending. You can simulate real-world monsoon conditions below:</p>
            <Button size="small" variant="primary" onClick={testHighRainfallScenario} busy={predictCustom.isPending}>
              🌧️ Simulate 72h Heavy Monsoon Rainfall (215mm)
            </Button>
          </div>
        ) : null}

        {predictCustom.isError ? (
          <ErrorNotice error={predictCustom.error} subject="risk prediction simulation" />
        ) : null}

        {data ? (
          <div className="stack" style={{ gap: "0.75rem" }}>
            <div
              style={{
                padding: "1rem",
                borderRadius: 8,
                background: isHighRisk
                  ? "rgba(239, 68, 68, 0.1)"
                  : isMedRisk
                  ? "rgba(234, 179, 8, 0.1)"
                  : "rgba(34, 197, 94, 0.1)",
                border: isHighRisk
                  ? "1px solid rgba(239, 68, 68, 0.3)"
                  : isMedRisk
                  ? "1px solid rgba(234, 179, 8, 0.3)"
                  : "1px solid rgba(34, 197, 94, 0.3)",
              }}
            >
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span className="small muted">24-Hour Disruption Probability</span>
                  <h2 style={{ margin: "0.2rem 0", color: isHighRisk ? "#ef4444" : isMedRisk ? "#eab308" : "#22c55e" }}>
                    {(data.probability * 100).toFixed(1)}%
                  </h2>
                </div>
                <StatusBadge
                  kind="access"
                  value={isHighRisk ? "BLOCKED" : isMedRisk ? "PROVISIONAL_CAUTION" : "OPEN"}
                />
              </div>
              <p className="small" style={{ margin: "0.25rem 0 0" }}>
                {isHighRisk
                  ? "🚨 High probability of landslide blockage within 24 hours. Preemptive convoy diversion recommended."
                  : isMedRisk
                  ? "⚠️ Moderate slope instability under ongoing rainfall. Convoy speed restriction advised."
                  : "✅ Stable corridor conditions. Normal transit authorized."}
              </p>
            </div>

            <div>
              <h4 style={{ marginBottom: "0.5rem" }}>🔍 SHAP Feature Attribution (Why this result?)</h4>
              <p className="small muted" style={{ marginBottom: "0.5rem" }}>
                TreeExplainer feature contributions showing exact physical drivers behind the risk score:
              </p>

              {data.top_contributions && data.top_contributions.length > 0 ? (
                <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.5rem" }}>
                  {data.top_contributions.map((c) => {
                    const isPositive = c.shap_contribution > 0;
                    return (
                      <li
                        key={c.feature_name}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "0.5rem 0.75rem",
                          borderRadius: 6,
                          background: "rgba(255,255,255,0.03)",
                          fontSize: "0.85rem",
                        }}
                      >
                        <div>
                          <strong>{c.feature_name.replace(/_/g, " ")}</strong>
                          <span className="small muted" style={{ marginLeft: "0.5rem" }}>
                            (Value: {typeof c.value === "number" ? c.value.toFixed(1) : c.value})
                          </span>
                        </div>
                        <span style={{ fontWeight: 600, color: isPositive ? "#ef4444" : "#22c55e" }}>
                          {isPositive ? "+" : ""}
                          {(c.shap_contribution * 100).toFixed(1)}% impact
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="small muted">Top SHAP feature contributions not available for this record.</p>
              )}
            </div>

            <div className="row" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
              {!customResult ? (
                <Button size="small" onClick={testHighRainfallScenario} busy={predictCustom.isPending}>
                  🌧️ Simulate 72h Monsoon Shock (215mm Rain)
                </Button>
              ) : (
                <Button size="small" onClick={resetToDbTelemetry}>
                  ↺ Reset to Telemetry
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
