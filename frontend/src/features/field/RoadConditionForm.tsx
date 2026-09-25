"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EdgeFeature } from "@/features/network";
import { edgeLabel } from "@/features/network";
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
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  // Default to the nearest segment once the list is known, without overriding a choice the officer made.
  useEffect(() => {
    if (edgeId === null && segments[0]) setEdgeId(segments[0].f.id);
  }, [segments, edgeId]);

  const chosen = useMemo(() => segments.find((s) => s.f.id === edgeId) ?? null, [segments, edgeId]);

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

    const payload = buildRoadConditionPayload({ status, notes, edgeId: chosen.f.id, edgeLabel: edgeLabel(chosen.f), location });
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
      <div className="stack">
        <p className="small muted">Tell the control room what the road is like now. It is saved on this device and sent when there is signal. A verifier decides whether the official road status changes.</p>
        {error ? <Banner tone="warn" title="Saving on this device is unavailable"><p className="small">{error}</p></Banner> : null}
        {saved ? (
          <Banner tone="ok" title="Saved on device — queued for sending">
            <p className="small">It will be sent when the connection returns. See it in the <Link href="/field/queue">send queue</Link>.</p>
          </Banner>
        ) : null}

        <fieldset>
          <legend>Which road segment?</legend>
          {segments.length === 0 ? <p className="small muted">No road segments are known near you yet. Update your location while online once, then they stay available offline.</p> : (
            <div className="choice-grid">
              {segments.slice(0, 6).map(({ f, d }) => (
                <label key={f.id} className="choice">
                  <input type="radio" name="rc-edge" checked={edgeId === f.id} onChange={() => setEdgeId(f.id)} />
                  <span>{edgeLabel(f)} <StatusBadge kind="access" value={f.props.accessibility_status} /><span className="small muted"> · {formatDistance(d)} · recorded status</span></span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>What do you see now?</legend>
          <div className="grid cols-3">
            {(Object.keys(OBSERVED_STATUS) as ObservedRoadStatus[]).map((k) => (
              <label key={k} className="choice">
                <input type="radio" name="rc-status" checked={status === k} onChange={() => setStatus(k)} />
                <span><strong>{OBSERVED_STATUS[k].label}</strong><br /><span className="small muted">{OBSERVED_STATUS[k].hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="What you observed (optional)" htmlFor="rc-notes" hint="Describe what you see, not what you expect to happen.">
          <textarea id="rc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1500} rows={3} />
        </Field>
        <div className="row" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
          {CONDITION_NOTE_CHIPS.map((c) => (
            <button key={c} type="button" className="btn small" onClick={() => setNotes((n) => (n ? `${n.trim()} ${c}.` : `${c}.`))}>{c}</button>
          ))}
        </div>

        {problems.length ? (
          <Banner tone="warn" title="Fix these before saving"><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></Banner>
        ) : null}
        <div><Button variant="primary" size="large" onClick={() => void submit()} busy={busy} disabled={!ready}>Save on device and queue for sending</Button></div>
      </div>
    </Card>
  );
}
