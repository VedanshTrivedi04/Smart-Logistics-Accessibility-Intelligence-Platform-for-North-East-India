"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REPORT_SEVERITIES, REPORT_TYPES, type ReportSeverity, type ReportType } from "@/shared/api";
import { usePrincipal } from "@/shared/auth";
import { formatCoords, humanize } from "@/shared/lib/format";
import { bboxAround, formatDistance, haversineMeters, isValidLatLon } from "@/shared/lib/geo";
import { formatDateTime } from "@/shared/lib/time";
import { MapView } from "@/shared/map";
import { StorageStatusPanel } from "./SyncQueue";
import { Banner, Button, Card, Field, StatusBadge, useAnnounce } from "@/shared/ui";
import { edgeLabel, useEdges } from "@/features/network";
import { emptyPayload, MAX_PHOTOS, validatePayload, type ReportPayload } from "./model";
import { requestBackgroundSync, useOffline } from "./OfflineProvider";
import { addMedia, getDraft, listMedia, newDraft, queueDraft, removeMedia, saveDraft } from "./store";
import { prepareImage } from "./sync/media";
import { useGeolocation } from "./useGeolocation";
import { StorageFullError } from "./store";

const STEPS = ["What happened", "Where", "Evidence", "How severe", "Review and save"] as const;

const TYPE_HINT: Partial<Record<ReportType, string>> = {
  LANDSLIDE: "Earth or rock on or near the road",
  FLOODING: "Water over the road or washing it out",
  ROAD_DAMAGE: "Potholes, cracks, subsidence",
  BRIDGE_COLLAPSE: "Bridge damaged or unsafe",
  TREE_FALL: "Tree or debris blocking the road",
  WEATHER_HAZARD: "Fog, ice, heavy rain making travel unsafe",
  SECURITY_INCIDENT: "Unrest or a security problem on the route",
};

const SEVERITY_HINT: Record<ReportSeverity, string> = {
  LOW: "Passable, minor problem",
  MEDIUM: "Slows traffic; caution needed",
  HIGH: "Serious; some vehicles cannot pass",
  CRITICAL: "Road is impassable or lives are at risk",
};

function LocationStep({ payload, set, draftId }: { payload: ReportPayload; set: (p: Partial<ReportPayload>) => void; draftId: string }) {
  const geo = useGeolocation();
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [acc, setAcc] = useState("100");
  const [manualError, setManualError] = useState<string | null>(null);
  const loc = payload.location;
  const bbox = useMemo(() => (loc ? bboxAround(loc.latitude, loc.longitude, 400) : null), [loc]);
  const edges = useEdges(bbox, 15, Boolean(bbox));
  const nearby = useMemo(() => {
    if (!loc) return [];
    return (edges.data?.features ?? [])
      .map((f) => ({ f, d: Math.min(...f.coordinates.map(([x, y]) => haversineMeters(loc.latitude, loc.longitude, y, x))) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);
  }, [edges.data, loc]);

  useEffect(() => {
    if (geo.state.status === "ok") {
      const f = geo.state.fix;
      set({ location: { latitude: f.latitude, longitude: f.longitude, accuracy_m: f.accuracy_m, location_provider: "GPS_HARDWARE", altitude_m: f.altitude_m } });
    }
    // set is stable per render of the parent; the fix object identity drives this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.state]);

  const applyManual = () => {
    const la = Number(lat);
    const lo = Number(lon);
    const ac = Number(acc);
    if (!isValidLatLon(la, lo) || lat.trim() === "" || lon.trim() === "") return setManualError("Enter a latitude between −90 and 90 and a longitude between −180 and 180.");
    if (!(ac > 0 && ac <= 5000)) return setManualError("Accuracy must be between 1 and 5000 metres. Use your best estimate of how far off the point could be.");
    setManualError(null);
    set({ location: { latitude: la, longitude: lo, accuracy_m: ac, location_provider: "MANUAL_MAP_PICK" } });
  };

  return (
    <div className="stack">
      <div className="stack">
        <Button size="large" variant="primary" onClick={geo.locate} busy={geo.state.status === "locating"}>Use my current location</Button>
        {geo.state.status === "denied" || geo.state.status === "unavailable" || geo.state.status === "timeout" ? (
          <Banner tone="warn" title="Could not get your position"><p className="small">{geo.state.message}</p></Banner>
        ) : null}
      </div>
      <fieldset>
        <legend>Or enter coordinates by hand</legend>
        <div className="grid cols-3">
          <Field label="Latitude" htmlFor="m-lat"><input id="m-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></Field>
          <Field label="Longitude" htmlFor="m-lon"><input id="m-lon" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} /></Field>
          <Field label="Accuracy (metres)" htmlFor="m-acc" hint="How far off could this point be?"><input id="m-acc" inputMode="numeric" value={acc} onChange={(e) => setAcc(e.target.value)} /></Field>
        </div>
        {manualError ? <p className="error" role="alert">{manualError}</p> : null}
        <Button onClick={applyManual}>Use these coordinates</Button>
      </fieldset>
      <div>
        <p className="small muted">You can also tap the map to set the spot (needs the map to load).</p>
        <MapView
          ariaLabel="Pick the report location"
          height={260}
          points={loc ? [{ id: draftId, kind: "report", lon: loc.longitude, lat: loc.latitude, label: "Report location", tone: "warn" }] : []}
          onMapClick={(lo, la) => set({ location: { latitude: la, longitude: lo, accuracy_m: Math.max(loc?.accuracy_m ?? 50, 50), location_provider: "MANUAL_MAP_PICK" } })}
          fitBounds={bbox}
          fitKey={loc ? `${loc.latitude.toFixed(4)}${loc.longitude.toFixed(4)}` : "none"}
        />
      </div>
      {loc ? (
        <Banner tone="ok" title="Location set">
          <p className="small">{formatCoords(loc.latitude, loc.longitude)} · ±{Math.round(loc.accuracy_m)} m · {humanize(loc.location_provider)}</p>
        </Banner>
      ) : null}
      {loc && (nearby.length > 0 || edges.isError) ? (
        <fieldset>
          <legend>Which road is it on? (optional)</legend>
          {edges.isError ? <p className="small muted">Road names need a connection. Skip this and a reviewer will match the location.</p> : null}
          <div className="choice-grid">
            <label className="choice"><input type="radio" name="edge" checked={payload.candidateEdgeId === null} onChange={() => set({ candidateEdgeId: null })} /> Not sure</label>
            {nearby.map(({ f, d }) => (
              <label key={f.id} className="choice"><input type="radio" name="edge" checked={payload.candidateEdgeId === f.id} onChange={() => set({ candidateEdgeId: f.id })} /> <span>{edgeLabel(f)}<span className="small muted"> · {formatDistance(d)}</span></span></label>
            ))}
          </div>
          <p className="small muted">This is a suggestion for the reviewer. It does not change any road status.</p>
        </fieldset>
      ) : null}
    </div>
  );
}

function EvidenceStep({ payload, set, draftId }: { payload: ReportPayload; set: (p: Partial<ReportPayload>) => void; draftId: string }) {
  const { db, ownerId, orgId, ready } = useOffline();
  const [photos, setPhotos] = useState<Array<{ id: string; url: string; name: string; size: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const urls = useRef<string[]>([]);

  const reload = useCallback(async () => {
    if (!db || !ownerId) return;
    const rows = await listMedia(db, ownerId, { draftId });
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = rows.map((m) => URL.createObjectURL(m.blob));
    setPhotos(rows.map((m, i) => ({ id: m.id, url: urls.current[i] as string, name: m.fileName, size: m.size })));
    set({ mediaLocalIds: rows.map((m) => m.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ownerId, draftId]);

  useEffect(() => {
    void reload();
    return () => urls.current.forEach((u) => URL.revokeObjectURL(u));
  }, [reload]);

  const onFiles = async (files: FileList | null) => {
    if (!files || !db || !ownerId || !orgId) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (photos.length >= MAX_PHOTOS) throw new Error(`At most ${MAX_PHOTOS} photos can be attached.`);
        const prepared = await prepareImage(file);
        await addMedia(db, { ownerId, orgId }, draftId, prepared.blob, prepared.fileName);
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The photo could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="row">
        <label className="btn large primary" style={{ cursor: "pointer" }}>
          Take a photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} disabled={!ready || busy} />
        </label>
        <label className="btn large" style={{ cursor: "pointer" }}>
          Choose from gallery
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} disabled={!ready || busy} />
        </label>
      </div>
      {busy ? <p role="status" className="muted">Saving photo on this device…</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {photos.length ? (
        <ul className="grid cols-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {photos.map((p) => (
            <li key={p.id} className="card" style={{ padding: "0.5rem" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={p.url} alt={`Attached photo ${p.name}`} style={{ width: "100%", borderRadius: 6 }} />
              <div className="row small"><span>{(p.size / 1024).toFixed(0)} KB</span><Button size="small" className="right" onClick={async () => { if (db && ownerId) { await removeMedia(db, ownerId, p.id); await reload(); } }}>Remove</Button></div>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">No photos yet. A photo is optional; an urgent text-only report can be sent without one.</p>}
      <Field label="Describe what you see" htmlFor="ev-desc" hint="What, where along the road, whether vehicles can pass. At least 3 characters.">
        <textarea id="ev-desc" value={payload.description} onChange={(e) => set({ description: e.target.value })} maxLength={2000} />
      </Field>
    </div>
  );
}

export function ReportWizard() {
  const params = useSearchParams();
  const router = useRouter();
  const me = usePrincipal();
  const announce = useAnnounce();
  const { db, ownerId, orgId, ready, error: dbError, syncNow, refresh } = useOffline();
  const draftParam = params.get("draft");
  const [draftId, setDraftId] = useState<string | null>(draftParam);
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [step, setStep] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [queued, setQueued] = useState<"queued" | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [queuing, setQueuing] = useState(false);
  const dirty = useRef(false);
  const initialised = useRef(false);

  // Create or load the draft. A new draft is persisted before the wizard is shown.
  useEffect(() => {
    if (!db || !ownerId || !orgId || initialised.current) return;
    initialised.current = true;
    void (async () => {
      if (draftParam) {
        const found = await getDraft(db, ownerId, draftParam);
        if (found) {
          setDraftId(draftParam);
          setPayload(found.payload);
          setStep(Math.min(found.draft.step, STEPS.length - 1));
          return;
        }
      }
      const id = await newDraft(db, { ownerId, orgId });
      setDraftId(id);
      setPayload(emptyPayload(new Date()));
      router.replace(`/field/report/new?draft=${id}`);
    })().catch((e: unknown) => setSaveError(e instanceof Error ? e.message : "Could not open local storage"));
  }, [db, ownerId, orgId, draftParam, router]);

  const update = useCallback((patch: Partial<ReportPayload>) => {
    dirty.current = true;
    setPayload((p) => (p ? { ...p, ...patch } : p));
  }, []);

  // Persist every change shortly after it happens; only then is "saved on device" shown.
  useEffect(() => {
    if (!db || !ownerId || !orgId || !draftId || !payload || !dirty.current) return;
    const t = setTimeout(() => {
      saveDraft(db, { ownerId, orgId }, draftId, payload, step)
        .then(() => { dirty.current = false; setSavedAt(new Date()); setSaveError(null); })
        .catch((e: unknown) => setSaveError(e instanceof StorageFullError ? e.message : e instanceof Error ? e.message : "Could not save on this device"));
    }, 400);
    return () => clearTimeout(t);
  }, [db, ownerId, orgId, draftId, payload, step]);

  const goto = (n: number) => {
    dirty.current = true;
    setStep(n);
  };

  if (dbError) return <Banner tone="danger" title="This device cannot store reports offline"><p className="small">{dbError}</p></Banner>;
  if (!ready || !payload || !draftId) return <p role="status" className="muted">Opening your draft…</p>;

  if (queued) {
    return (
      <Card title="Saved on this device">
        <div className="stack">
          <Banner tone="ok" title="Saved on device — not yet submitted">
            <p className="small">Your report is in the send queue. It counts as submitted only when the server accepts it. It will send automatically when the service is reachable.</p>
          </Banner>
          <div className="row">
            <Link className="btn primary" href="/field/queue">See the send queue</Link>
            <Link className="btn" href="/field/report/new" onClick={() => window.location.assign("/field/report/new")}>Report another</Link>
            <Link className="btn" href="/field">Back to home</Link>
          </div>
        </div>
      </Card>
    );
  }

  const finish = async () => {
    const found = validatePayload(payload);
    setProblems(found);
    if (found.length) return;
    setQueuing(true);
    try {
      await saveDraft(db as NonNullable<typeof db>, { ownerId: ownerId as string, orgId: orgId as string }, draftId, payload, step);
      await queueDraft(db as NonNullable<typeof db>, ownerId as string, draftId);
      setQueued("queued");
      announce("Saved on device. Not yet submitted.");
      void requestBackgroundSync();
      await refresh();
      void syncNow();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not queue the report");
    } finally {
      setQueuing(false);
    }
  };

  return (
    <div className="stack">
      <ol className="step-list" aria-label="Progress">
        {STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined}>{i + 1}. {s}</li>)}
      </ol>
      <p className="small muted" role="status">
        {saveError ? <span className="error">{saveError}</span> : savedAt ? `Draft saved on device at ${formatDateTime(savedAt)}` : "Draft not changed yet"} · Reporting as {me.display_name}
      </p>

      <Card title={STEPS[step] ?? ""}>
        {step === 0 ? (
          <fieldset>
            <legend className="sr-only">What happened</legend>
            <div className="choice-grid">
              {REPORT_TYPES.map((t) => (
                <label key={t} className="choice">
                  <input type="radio" name="rtype" checked={payload.reportType === t} onChange={() => update({ reportType: t })} />
                  <span>{humanize(t)}{TYPE_HINT[t] ? <span className="small muted"><br />{TYPE_HINT[t]}</span> : null}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {step === 1 ? <LocationStep payload={payload} set={update} draftId={draftId} /> : null}
        {step === 2 ? <EvidenceStep payload={payload} set={update} draftId={draftId} /> : null}
        {step === 3 ? (
          <fieldset>
            <legend className="sr-only">How severe</legend>
            <div className="choice-grid">
              {REPORT_SEVERITIES.map((s) => (
                <label key={s} className="choice">
                  <input type="radio" name="sev" checked={payload.severity === s} onChange={() => update({ severity: s })} />
                  <span>{humanize(s)}<span className="small muted"><br />{SEVERITY_HINT[s]}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {step === 4 ? (
          <div className="stack">
            <dl className="kv">
              <dt>What</dt><dd>{humanize(payload.reportType)}</dd>
              <dt>Severity</dt><dd>{payload.severity ? <StatusBadge kind="severity" value={payload.severity} /> : "—"}</dd>
              <dt>Where</dt><dd>{payload.location ? `${formatCoords(payload.location.latitude, payload.location.longitude)} (±${Math.round(payload.location.accuracy_m)} m, ${humanize(payload.location.location_provider)})` : "—"}</dd>
              <dt>Description</dt><dd>{payload.description || "—"}</dd>
              <dt>Photos</dt><dd>{payload.mediaLocalIds.length}</dd>
            </dl>
            <Field label="When did you observe this?" htmlFor="obs-at" hint="Not when you are sending it. The server records both.">
              <input id="obs-at" type="datetime-local" value={toLocalInput(payload.observedAt)} onChange={(e) => e.target.value && update({ observedAt: new Date(e.target.value).toISOString() })} />
            </Field>
            {problems.length ? (
              <Banner tone="warn" title="Fix these before saving">
                <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </Banner>
            ) : null}
            <p className="small">This is your observation. It is not verified until a reviewer confirms it, and it does not change any road status by itself.</p>
            <Button size="large" variant="primary" busy={queuing} onClick={() => void finish()}>Save on device and queue for sending</Button>
            <StorageStatusPanel />
          </div>
        ) : null}
      </Card>

      <div className="row">
        <Button onClick={() => goto(Math.max(0, step - 1))} disabled={step === 0}>Back</Button>
        {step < STEPS.length - 1 ? <Button variant="primary" onClick={() => goto(step + 1)}>Next</Button> : null}
        <Link className="btn right" href="/field/queue">Save draft and leave</Link>
      </div>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
