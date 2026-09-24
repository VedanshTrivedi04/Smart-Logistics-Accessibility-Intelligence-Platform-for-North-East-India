"use client";

import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Navigation,
  RotateCcw,
  type LucideIcon,
  Compass,
} from "lucide-react";
import { formatDistance } from "@/shared/lib/geo";
import { formatDuration } from "@/shared/lib/time";
import type { DirectionStep, TurnKind } from "./directions";

const TURN_ICON: Record<TurnKind, LucideIcon> = {
  start: Navigation,
  straight: ArrowUp,
  slight_left: ArrowUpLeft,
  slight_right: ArrowUpRight,
  left: CornerUpLeft,
  right: CornerUpRight,
  sharp_left: CornerUpLeft,
  sharp_right: CornerUpRight,
  uturn: RotateCcw,
  arrive: Flag,
};

const TURN_LABEL: Record<TurnKind, string> = {
  start: "Head out on",
  straight: "Continue along",
  slight_left: "Slight left onto",
  slight_right: "Slight right onto",
  left: "Turn left onto",
  right: "Turn right onto",
  sharp_left: "Sharp mountain left onto",
  sharp_right: "Sharp mountain right onto",
  uturn: "Make a U-turn onto",
  arrive: "Arrive at destination",
};

/**
 * Google-Maps-style step list in light elegant GovTech theme.
 * Clicking a step recenters the map on that step.
 */
export function DirectionsList({
  steps,
  activeIndex = null,
  onStepClick,
}: {
  steps: DirectionStep[];
  activeIndex?: number | null;
  onStepClick?: (index: number, step: DirectionStep) => void;
}) {
  if (steps.length === 0) return null;

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "16px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "1rem 1.4rem",
          borderBottom: "1px solid #f1f5f9",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          background: "linear-gradient(90deg, #f8fafc 0%, #ffffff 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Compass size={18} color="#0284c7" />
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
            Turn-by-Turn Navigation & Guidance
          </h3>
        </div>
        <span
          style={{
            fontSize: "0.75rem",
            color: "#64748b",
            background: "#f1f5f9",
            padding: "0.2rem 0.6rem",
            borderRadius: "9999px",
            fontWeight: 500,
          }}
        >
          {steps.length} Steps · Click any step to inspect on map
        </span>
      </div>

      <ol style={{ listStyle: "none", padding: "0.5rem", margin: 0, display: "grid", gap: "2px" }}>
        {steps.map((s, i) => {
          const Icon = TURN_ICON[s.turn] || Navigation;
          const active = activeIndex === i;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onStepClick?.(i, s)}
                disabled={!onStepClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.85rem",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "10px",
                  border: active ? "1.5px solid #0284c7" : "1px solid transparent",
                  background: active ? "#f0f9ff" : "transparent",
                  cursor: onStepClick ? "pointer" : "default",
                  font: "inherit",
                  color: "#0f172a",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: active ? "#0284c7" : "#e0f2fe",
                    color: active ? "#ffffff" : "#0284c7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#0f172a" }}>
                    {TURN_LABEL[s.turn]} <span style={{ color: "#0284c7" }}>{s.roadName}</span>
                  </div>
                  {s.turn !== "arrive" ? (
                    <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.15rem" }}>
                      {formatDistance(s.distanceMeters)}
                      {s.durationSeconds ? ` · approx ${formatDuration(s.durationSeconds)}` : ""}
                    </div>
                  ) : null}
                </div>

                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "#94a3b8",
                    fontWeight: 600,
                    padding: "0.15rem 0.4rem",
                    borderRadius: "4px",
                    background: "#f1f5f9",
                  }}
                >
                  #{i + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
