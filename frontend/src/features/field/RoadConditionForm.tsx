"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EdgeFeature } from "@/features/network";
import { edgeLabel } from "@/features/network";
import type { LaneStatus } from "@/shared/api";
import { snapToCorridor } from "@/shared/lib/corridors";
import { formatDistance } from "@/shared/lib/geo";
import { Banner, Button, Card, Field, StatusBadge } from "@/shared/ui";
import { validatePayload, type ReportLocation } from "./model";
import { requestBackgroundSync, useOffline } from "./OfflineProvider";
import { buildRoadConditionPayload, CONDITION_NOTE_CHIPS, OBSERVED_STATUS, type ObservedRoadStatus } from "./roadCondition";
import { newDraft, queueDraft, saveDraft } from "./store";
import type { GeoFix } from "./useGeolocation";

interface Props {
  segments: ReadonlyArray<{ f: EdgeFeature; d: number }>;
  fix: GeoFix | null;
}

/**
 * Report the current condition of a road segment. Saved on the device and sent when there is signal, so it
 * works with no network. It is an observation for a verifier; it does not change road status by itself.
 */
export function RoadConditionForm({ segments, fix }: Props) {
  const { db, ownerId, orgId, ready, error, syncNow } = useOffline();
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [status, setStatus] = useState<ObservedRoadStatus | null>(null);
  const [laneStatus, setLaneStatus] = useState<LaneStatus | null>(null);
  const [passableClasses, setPassableClasses] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  // Snapped corridor context
  const corridor = useMemo(() => (fix ? snapToCorridor(fix.latitude, fix.longitude) : null), [fix]);

  // Default to the nearest segment once the list is known, without overriding a choice the officer made.
  useEffect(() => {
    if (edgeId === null && segments[0]) setEdgeId(segments[0].f.id);
  }, [segments, edgeId]);

  const chosen = useMemo(() => segments.find((s) => s.f.id === edgeId) ?? null, [segments, edgeId]);

  const toggleVehicleClass = (cls: string) => {
    setPassableClasses((prev) => (prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]));
  };

  const submit = async () => {
    const found: string[] = [];
    if (!chosen) found.push("Choose the road segment.");
    if (!status) found.push("Choose what you see on the road.");
    if (!db || !ownerId || !orgId) found.push("Saving on this device is not available right now.");
    if (found.length || !chosen || !status || !db || !ownerId || !orgId) return setProblems(found);

    // Prefer the officer's own position. Without a fix, use the middle of the chosen segment and say so.
    const mid = chosen.f.coordinates[Math.floor(chosen.f.coordinates.length / 2)];
    const location: ReportLocation | null = fix
      ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy_m, location_provider: fix.accuracy_m > 100 ? "NETWORK_COARSE" : "GPS_HARDWARE", altitude_m: fix.altitude_m }
      : mid
        ? { latitude: mid[1], longitude: mid[0], accuracy_m: 500, location_provider: "MANUAL_MAP_PICK" }
        : null;
    if (!location) return setProblems(["No location is available for this segment. Update your location first."]);

    const payload = buildRoadConditionPayload({
      status,
      notes,
      edgeId: chosen.f.id,
      edgeLabel: edgeLabel(chosen.f),
      location,
      laneStatus: status === "RESTRICTED" ? laneStatus : undefined,
      passableClasses: status === "RESTRICTED" ? passableClasses : [],
    });
    const invalid = validatePayload(payload);
    if (invalid.length) return setProblems(invalid);

    setBusy(true);
    setProblems([]);
    try {
      const who = { ownerId, orgId };
      const id = await newDraft(db, who);
      await saveDraft(db, who, id, payload, 4);
      await queueDraft(db, ownerId, id);
      setSaved(true);
      setStatus(null);
      setLaneStatus(null);
      setPassableClasses([]);
      setNotes("");
      void requestBackgroundSync();
      void syncNow();
    } catch (e) {
      setProblems([e instanceof Error ? e.message : "Could not save on this device."]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Report road condition (works offline)">
      <div className="stack" style={{ gap: "1rem" }}>
        {/* Tactical Corridor Position HUD */}
        {corridor && corridor.isWithinCorridor && (
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "10px",
              padding: "0.75rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase" }}>
                Active Patrol Lifeline Corridor
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#1e3a8a", marginTop: "0.1rem" }}>
                {corridor.formattedChainage} · {corridor.nearestMilestone}
              </div>
            </div>
            <span style={{ fontSize: "0.75rem", background: "#dbeafe", color: "#1e40af", padding: "0.2rem 0.6rem", borderRadius: "6px", fontWeight: 600 }}>
              ±{corridor.offCorridorM}m from centerline
            </span>
          </div>
        )}

        <p className="small muted" style={{ margin: 0 }}>
          Tell the control room what the road is like now. It is saved on this device and sent when there is signal. A verifier decides whether the official road status changes.
        </p>

        {error ? <Banner tone="warn" title="Saving on this device is unavailable"><p className="small">{error}</p></Banner> : null}
        {saved ? (
          <Banner tone="ok" title="Saved on device — queued for sending">
            <p className="small">It will be sent when the connection returns. See it in the <Link href="/field/queue">send queue</Link>.</p>
          </Banner>
        ) : null}

        <fieldset>
          <legend>Which road segment?</legend>
          {segments.length === 0 ? (
            <p className="small muted">No road segments are known near you yet. Update your location while online once, then they stay available offline.</p>
          ) : (
            <div className="choice-grid">
              {segments.slice(0, 6).map(({ f, d }) => (
                <label key={f.id} className="choice">
                  <input type="radio" name="rc-edge" checked={edgeId === f.id} onChange={() => setEdgeId(f.id)} />
                  <span>
                    <strong>{edgeLabel(f)}</strong> <StatusBadge kind="access" value={f.props.accessibility_status} />
                    <br />
                    <span className="small muted">{formatDistance(d)} away · recorded status: {f.props.accessibility_status}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>What do you see now?</legend>
          <div className="grid cols-3">
            {(Object.keys(OBSERVED_STATUS) as ObservedRoadStatus[]).map((k) => (
              <label key={k} className="choice" style={{ border: status === k ? "2px solid #0284c7" : undefined }}>
                <input
                  type="radio"
                  name="rc-status"
                  checked={status === k}
                  onChange={() => {
                    setStatus(k);
                    if (k === "RESTRICTED" && !laneStatus) setLaneStatus("SINGLE_LANE_OPEN");
                  }}
                />
                <span>
                  <strong style={{ fontSize: "0.95rem" }}>{OBSERVED_STATUS[k].label}</strong>
                  <br />
                  <span className="small muted">{OBSERVED_STATUS[k].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Restricted Passability Matrix */}
        {status === "RESTRICTED" && (
          <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "0.5rem", textTransform: "uppercase" }}>
              Restricted Passability Specification
            </div>
            <div className="grid cols-2" style={{ gap: "0.75rem", marginBottom: "0.75rem" }}>
              <label className="choice">
                <input
                  type="radio"
                  name="rc-lane"
                  checked={laneStatus === "SINGLE_LANE_OPEN" || laneStatus === null}
                  onChange={() => setLaneStatus("SINGLE_LANE_OPEN")}
                />
                <span><strong>Single Lane Passable</strong><br /><span className="small muted">Alternating one-way convoy flow</span></span>
              </label>
              <label className="choice">
                <input
                  type="radio"
                  name="rc-lane"
                  checked={laneStatus === "SHOULDER_ONLY"}
                  onChange={() => setLaneStatus("SHOULDER_ONLY")}
                />
                <span><strong>Unpaved Shoulder Only</strong><br /><span className="small muted">Carriageway blocked; bypass via shoulder</span></span>
              </label>
            </div>

            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "0.4rem" }}>
              Permitted Vehicles (Select all that can safely traverse):
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {[
                { id: "LIGHT_4X4", label: "🚙 4x4 / Light Utility" },
                { id: "EMERGENCY_ONLY", label: "🚑 Emergency / Ambulance" },
                { id: "HEAVY_TRUCK", label: "🚛 Multi-Axle Logistics Trucks" },
              ].map((v) => (
                <label key={v.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "#ffffff", padding: "0.35rem 0.7rem", borderRadius: "6px", border: "1px solid #cbd5e1", cursor: "pointer", fontSize: "0.82rem" }}>
                  <input
                    type="checkbox"
                    checked={passableClasses.includes(v.id)}
                    onChange={() => toggleVehicleClass(v.id)}
                  />
                  <span>{v.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <Field label="Ground observations & clearance notes" htmlFor="rc-notes" hint="Describe objective ground facts (e.g. debris removed from eastbound lane, 1 lane passable with pilot escort).">
          <textarea id="rc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1500} rows={3} placeholder="Provide details on road conditions, active clearance machinery, or weather..." />
        </Field>
        <div className="row" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
          {CONDITION_NOTE_CHIPS.map((c) => (
            <button key={c} type="button" className="btn small" onClick={() => setNotes((n) => (n ? `${n.trim()} ${c}.` : `${c}.`))}>{c}</button>
          ))}
        </div>

        {/* Downstream Intelligence Card */}
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "0.85rem 1rem", borderRadius: "10px" }}>
          <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#166534", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span>🔄</span> Closed-Loop Downstream Intelligence
          </div>
          <div style={{ fontSize: "0.78rem", color: "#15803d", marginTop: "0.25rem", lineHeight: 1.45 }}>
            Submitting this observation creates an authoritative inspection report linked to segment <strong>{chosen ? edgeLabel(chosen.f) : "selected road"}</strong>. Once verified by District Operations Command, this updates the Spatial Graph and prompts the Regional Impact Engine to recalculate safe corridors for stranded supply convoys.
          </div>
        </div>

        {problems.length ? (
          <Banner tone="warn" title="Fix these before saving"><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></Banner>
        ) : null}
        <div>
          <Button variant="primary" size="large" onClick={() => void submit()} busy={busy} disabled={!ready}>
            Save on device and queue for sending
          </Button>
        </div>
      </div>
    </Card>
  );
}
