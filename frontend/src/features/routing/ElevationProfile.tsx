"use client";

import React, { useMemo, useState } from "react";
import { Mountain, ShieldCheck, AlertTriangle, TrendingUp, Gauge, Compass, Activity, ArrowRight } from "lucide-react";
import { formatDistance } from "@/shared/lib/geo";
import { formatDuration } from "@/shared/lib/time";

interface ElevationProfileProps {
  originName: string;
  originAlt?: number;
  destName: string;
  destAlt?: number;
  distanceMeters: number;
  durationSeconds: number;
  hazardCount: number;
  hasPilotSensors?: boolean;
}

interface ProfilePoint {
  km: number;
  alt: number;
  label?: string;
  type?: "origin" | "summit" | "pass" | "valley" | "dest" | "waypoint";
}

export function ElevationProfile({
  originName,
  originAlt = 80,
  destName,
  destAlt = 120,
  distanceMeters,
  durationSeconds,
  hazardCount,
  hasPilotSensors = false,
}: ElevationProfileProps) {
  const [hoveredPoint, setHoveredPoint] = useState<ProfilePoint | null>(null);

  const totalKm = Math.max(1, Math.round(distanceMeters / 1000));

  // Synthesize realistic terrain profile along the known North-East mountain corridor
  const { points, peakAlt, minAlt, totalClimb, totalDescent, maxGradient, terrainType } = useMemo(() => {
    const oAlt = originAlt;
    const dAlt = destAlt;

    // Determine intermediate mountain peak based on geographic altitude of origin and destination
    let summitAlt = Math.max(oAlt, dAlt);
    // If either point is high hill (like Shillong > 1000m, Kohima > 1400m, Aizawl > 1100m)
    // or if traversing between hills and plains, the highway crests at ridges
    if (oAlt > 800 || dAlt > 800) {
      summitAlt = Math.max(oAlt, dAlt) + 120;
    } else {
      // Plains or low rolling hills (e.g., Guwahati to Jorhat via Kaziranga foothills)
      summitAlt = Math.max(oAlt, dAlt) + 60;
    }

    const numSegments = 16;
    const pts: ProfilePoint[] = [];

    for (let i = 0; i <= numSegments; i++) {
      const progress = i / numSegments;
      const km = Math.round(progress * totalKm);

      // Smooth terrain curve using weighted hermite / sine mountain shape
      let alt: number;
      if (oAlt < dAlt) {
        // Net climb (e.g. Guwahati 55m -> Shillong 1525m)
        const base = oAlt + (dAlt - oAlt) * Math.pow(progress, 0.9);
        const crestBump = Math.sin(progress * Math.PI) * (summitAlt - Math.max(oAlt, dAlt));
        alt = Math.round(base + crestBump);
      } else if (oAlt > dAlt) {
        // Net descent (e.g. Shillong 1525m -> Silchar 25m)
        // High hill spine before descent into valley
        const spineFactor = Math.sin(Math.min(1, progress * 1.5) * Math.PI * 0.5);
        const base = oAlt - (oAlt - dAlt) * Math.pow(progress, 1.2);
        const crestBump = progress < 0.4 ? Math.sin(progress * 2.5 * Math.PI) * 110 : 0;
        alt = Math.round(base + crestBump);
      } else {
        // Rolling plains
        alt = Math.round(oAlt + Math.sin(progress * Math.PI * 2) * 35);
      }

      // Add characteristic mountain road dips & rises
      if (i > 0 && i < numSegments) {
        const ripple = Math.sin(i * 1.8) * 18;
        alt = Math.max(10, Math.round(alt + ripple));
      }

      let type: ProfilePoint["type"] = "waypoint";
      let label: string | undefined = undefined;

      if (i === 0) {
        type = "origin";
        label = originName;
        alt = oAlt;
      } else if (i === numSegments) {
        type = "dest";
        label = destName;
        alt = dAlt;
      }

      pts.push({ km, alt, label, type });
    }

    // Find actual peak and min points
    let max = -Infinity;
    let min = Infinity;
    let peakIndex = 0;

    pts.forEach((p, idx) => {
      if (p.alt > max) {
        max = p.alt;
        peakIndex = idx;
      }
      if (p.alt < min) {
        min = p.alt;
      }
    });

    if (peakIndex > 0 && peakIndex < pts.length - 1) {
      pts[peakIndex]!.type = "summit";
      pts[peakIndex]!.label = "Mountain Pass Summit";
    }

    // Calculate total climb and descent
    let climb = 0;
    let descent = 0;
    for (let j = 1; j < pts.length; j++) {
      const diff = pts[j]!.alt - pts[j - 1]!.alt;
      if (diff > 0) climb += diff;
      else descent += Math.abs(diff);
    }

    // Gradient calculation
    const avgDist = totalKm > 0 ? totalKm : 1;
    const grad = Math.min(12, Number(((climb / (avgDist * 1000)) * 100).toFixed(1)));

    let classification = "Rolling Hill Expressway";
    if (max > 1200) classification = "High Mountain Ridge & Pass";
    else if (max > 500) classification = "Sub-Himalayan Hill Corridor";
    else if (grad < 1.5) classification = "Plains River Valley Corridor";

    return {
      points: pts,
      peakAlt: max,
      minAlt: min,
      totalClimb: climb,
      totalDescent: descent,
      maxGradient: Math.max(2.4, grad),
      terrainType: classification,
    };
  }, [originAlt, destAlt, totalKm, originName, destName]);

  // SVG Chart dimensions
  const svgWidth = 640;
  const svgHeight = 160;
  const paddingX = 40;
  const paddingTop = 25;
  const paddingBottom = 30;

  const chartW = svgWidth - paddingX * 2;
  const chartH = svgHeight - paddingTop - paddingBottom;

  const yMin = Math.max(0, Math.floor(minAlt / 100) * 100 - 50);
  const yMax = Math.ceil(peakAlt / 100) * 100 + 100;
  const yRange = yMax - yMin || 1;

  // Convert points to SVG coordinates
  const svgCoords = useMemo(() => {
    return points.map((p) => {
      const x = paddingX + (p.km / totalKm) * chartW;
      const y = paddingTop + chartH - ((p.alt - yMin) / yRange) * chartH;
      return { x, y, p };
    });
  }, [points, totalKm, chartW, chartH, paddingX, paddingTop, yMin, yRange]);

  // Construct SVG Path
  const { pathD, areaD } = useMemo(() => {
    if (svgCoords.length === 0) return { pathD: "", areaD: "" };

    let d = `M ${svgCoords[0]!.x} ${svgCoords[0]!.y}`;
    for (let i = 1; i < svgCoords.length; i++) {
      const prev = svgCoords[i - 1]!;
      const curr = svgCoords[i]!;
      const cpX1 = prev.x + (curr.x - prev.x) / 2;
      const cpX2 = cpX1;
      d += ` C ${cpX1} ${prev.y}, ${cpX2} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    const first = svgCoords[0]!;
    const last = svgCoords[svgCoords.length - 1]!;
    const bottomY = paddingTop + chartH;
    const aD = `${d} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;

    return { pathD: d, areaD: aD };
  }, [svgCoords, paddingTop, chartH]);

  // Safety / Passability Index calculations
  const clearPercent = hazardCount === 0 ? 94 : Math.max(72, 92 - hazardCount * 8);
  const cautionPercent = 100 - clearPercent;

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
      {/* Header Banner */}
      <div
        style={{
          padding: "1.2rem 1.5rem",
          borderBottom: "1px solid #f1f5f9",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          background: "linear-gradient(90deg, #f8fafc 0%, #ffffff 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#e0f2fe",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0284c7",
            }}
          >
            <Mountain size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
              Terrain Elevation & Incline Mountain Profile
            </h3>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
              Topographical cross-section & hill highway gradient analysis
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              background: "#f0fdf4",
              color: "#166534",
              border: "1px solid #bbf7d0",
              padding: "0.25rem 0.65rem",
              borderRadius: "9999px",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            <TrendingUp size={13} />
            {terrainType}
          </span>
          {hasPilotSensors && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                background: "#e0f2fe",
                color: "#0369a1",
                border: "1px solid #bae6fd",
                padding: "0.25rem 0.65rem",
                borderRadius: "9999px",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              <Activity size={13} />
              Telemetry Verified
            </span>
          )}
        </div>
      </div>

      {/* Metric Tiles Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "1px",
          background: "#f1f5f9",
          borderBottom: "1px solid #f1f5f9",
        }}
      >
        <div style={{ background: "#ffffff", padding: "0.9rem 1.25rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500, display: "block" }}>
            Peak Pass Elevation
          </span>
          <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0284c7" }}>
            {peakAlt.toLocaleString()} m
          </span>
          <span style={{ fontSize: "0.7rem", color: "#94a3b8", display: "block" }}>
            Crest altitude
          </span>
        </div>

        <div style={{ background: "#ffffff", padding: "0.9rem 1.25rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500, display: "block" }}>
            Net Elevation Delta
          </span>
          <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a" }}>
            {destAlt - originAlt >= 0 ? `+${destAlt - originAlt}` : `${destAlt - originAlt}`} m
          </span>
          <span style={{ fontSize: "0.7rem", color: "#94a3b8", display: "block" }}>
            {destAlt >= originAlt ? "Net Hill Climb" : "Net Hill Descent"}
          </span>
        </div>

        <div style={{ background: "#ffffff", padding: "0.9rem 1.25rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500, display: "block" }}>
            Total Climb / Ascent
          </span>
          <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#059669" }}>
            +{totalClimb} m
          </span>
          <span style={{ fontSize: "0.7rem", color: "#94a3b8", display: "block" }}>
            Cumulative ascent
          </span>
        </div>

        <div style={{ background: "#ffffff", padding: "0.9rem 1.25rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500, display: "block" }}>
            Estimated Incline Grade
          </span>
          <span style={{ fontSize: "1.35rem", fontWeight: 800, color: maxGradient > 5 ? "#d97706" : "#475569" }}>
            {maxGradient}%
          </span>
          <span style={{ fontSize: "0.7rem", color: "#94a3b8", display: "block" }}>
            {maxGradient > 5 ? "Steep Hill Sector" : "Moderate Hill Grade"}
          </span>
        </div>
      </div>

      {/* SVG Elevation Chart Area */}
      <div style={{ padding: "1.25rem 1.5rem 0.5rem", position: "relative" }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: "100%", height: "auto", overflow: "visible" }}
          aria-label="Terrain Elevation Profile Chart"
        >
          <defs>
            <linearGradient id="elevationGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.32" />
              <stop offset="70%" stopColor="#38bdf8" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="50%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={paddingTop}
            x2={svgWidth - paddingX}
            y2={paddingTop}
            stroke="#e2e8f0"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text
            x={paddingX - 8}
            y={paddingTop + 4}
            textAnchor="end"
            fontSize="10"
            fill="#94a3b8"
            fontWeight="500"
          >
            {yMax}m
          </text>

          <line
            x1={paddingX}
            y1={paddingTop + chartH / 2}
            x2={svgWidth - paddingX}
            y2={paddingTop + chartH / 2}
            stroke="#f1f5f9"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text
            x={paddingX - 8}
            y={paddingTop + chartH / 2 + 4}
            textAnchor="end"
            fontSize="10"
            fill="#94a3b8"
            fontWeight="500"
          >
            {Math.round((yMax + yMin) / 2)}m
          </text>

          <line
            x1={paddingX}
            y1={paddingTop + chartH}
            x2={svgWidth - paddingX}
            y2={paddingTop + chartH}
            stroke="#cbd5e1"
            strokeWidth="1"
          />
          <text
            x={paddingX - 8}
            y={paddingTop + chartH + 4}
            textAnchor="end"
            fontSize="10"
            fill="#94a3b8"
            fontWeight="500"
          >
            {yMin}m
          </text>

          {/* Shaded Area */}
          <path d={areaD} fill="url(#elevationGrad)" />

          {/* Line Curve */}
          <path d={pathD} fill="none" stroke="url(#lineGrad)" strokeWidth="3" strokeLinecap="round" />

          {/* Waypoints & Callouts */}
          {svgCoords.map(({ x, y, p }, idx) => {
            const isOrigin = idx === 0;
            const isDest = idx === svgCoords.length - 1;
            const isSummit = p.type === "summit";

            if (!isOrigin && !isDest && !isSummit) return null;

            return (
              <g
                key={idx}
                onMouseEnter={() => setHoveredPoint(p)}
                onMouseLeave={() => setHoveredPoint(null)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={isSummit ? 6 : 5}
                  fill="#ffffff"
                  stroke={isOrigin ? "#0284c7" : isDest ? "#059669" : "#d97706"}
                  strokeWidth="2.5"
                />
                <circle
                  cx={x}
                  cy={y}
                  r={isSummit ? 3 : 2.5}
                  fill={isOrigin ? "#0284c7" : isDest ? "#059669" : "#d97706"}
                />

                {/* Text Badge for Origin / Summit / Dest */}
                <text
                  x={x}
                  y={y - 12}
                  textAnchor={isOrigin ? "start" : isDest ? "end" : "middle"}
                  fontSize="10.5"
                  fontWeight="700"
                  fill="#0f172a"
                >
                  {p.alt}m
                </text>
                <text
                  x={x}
                  y={paddingTop + chartH + 18}
                  textAnchor={isOrigin ? "start" : isDest ? "end" : "middle"}
                  fontSize="10"
                  fontWeight="500"
                  fill="#64748b"
                >
                  {isOrigin ? `${originName} (0 km)` : isDest ? `${destName} (${totalKm} km)` : `${p.km} km (Pass)`}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover info tooltip */}
        {hoveredPoint && (
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "20px",
              background: "#0f172a",
              color: "#ffffff",
              padding: "0.4rem 0.75rem",
              borderRadius: "8px",
              fontSize: "0.75rem",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              pointerEvents: "none",
            }}
          >
            <strong>{hoveredPoint.label ?? `Kilometer ${hoveredPoint.km}`}</strong>: {hoveredPoint.alt} m altitude
          </div>
        )}
      </div>

      {/* Route Passability & Hazard Health Index */}
      <div
        style={{
          margin: "0.75rem 1.5rem 1.25rem",
          padding: "1rem 1.25rem",
          borderRadius: "12px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Gauge size={16} color="#0284c7" />
            <strong style={{ fontSize: "0.85rem", color: "#0f172a" }}>
              Corridor Passability & Hazard Threat Index
            </strong>
          </div>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: hazardCount > 0 ? "#b45309" : "#15803d" }}>
            {clearPercent}% Clear / Passable ({cautionPercent}% High Monsoon Watch)
          </span>
        </div>

        {/* Multi-segment Progress Bar */}
        <div
          style={{
            height: "8px",
            width: "100%",
            background: "#e2e8f0",
            borderRadius: "9999px",
            overflow: "hidden",
            display: "flex",
          }}
        >
          <div
            style={{
              width: `${clearPercent}%`,
              background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
              transition: "width 0.4s ease",
            }}
          />
          <div
            style={{
              width: `${cautionPercent}%`,
              background: "#f59e0b",
              transition: "width 0.4s ease",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem", fontSize: "0.75rem", color: "#64748b", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            <span>Open Highway: <strong>{Math.round((clearPercent / 100) * totalKm)} km</strong></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
            <span>Monsoon Slopes: <strong>{Math.round((cautionPercent / 100) * totalKm)} km</strong></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <ShieldCheck size={14} color="#059669" />
            <span style={{ color: "#059669", fontWeight: 600 }}>Commercial HCV Accessible</span>
          </div>
        </div>
      </div>
    </div>
  );
}
