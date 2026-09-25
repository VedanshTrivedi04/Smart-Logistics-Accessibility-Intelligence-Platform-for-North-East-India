"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { humanize } from "@/shared/lib/format";
import { formatAge, formatDateTime } from "@/shared/lib/time";
import { useNow } from "@/shared/lib/useNow";
import { formatBytes, STATE_REMEDY, type OperationRecord } from "@/shared/offline";
import { Banner, Button, Card, StatusBadge, useAnnounce } from "@/shared/ui";
import { snapToCorridor } from "@/shared/lib/corridors";
import { isReportPayload } from "./model";
import { useOffline } from "./OfflineProvider";
import { buildSmsReport, fieldSmsNumber, smsHref } from "./sms";
import { cleanupSyncedMedia, discardDraft, discardOperation, reopenAsDraft, updateOperation } from "./store";

export function StorageStatusPanel() {
  const { storage, persisted, askPersist, db, ownerId } = useOffline();
  const announce = useAnnounce();
  if (!storage) return null;
  const pct = Math.min(100, Math.round(storage.ratio * 100));
  return (
    <Card title="Storage on this device">
      <div className="stack" style={{ gap: "0.75rem" }}>
        {!storage.supported ? (
          <Banner tone="warn" title="Storage usage cannot be measured"><p className="small">This browser does not report storage quota, so a full device cannot be predicted. Sync often.</p></Banner>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
              <span className="small">Using <strong>{formatBytes(storage.usageBytes)}</strong> of ~{formatBytes(storage.quotaBytes)}</span>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: pct > 85 ? "#dc2626" : pct > 60 ? "#d97706" : "#16a34a" }}>{pct}% utilized</span>
            </div>
            <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct > 85 ? "#dc2626" : pct > 60 ? "#d97706" : "#0284c7", transition: "width 0.3s ease" }} />
            </div>
            {storage.level === "warning" || storage.level === "critical" ? (
              <div style={{ marginTop: "0.6rem" }}>
                <Banner tone={storage.level === "critical" ? "danger" : "warn"} title={storage.level === "critical" ? "Storage is almost full" : "Storage is getting full"}>
                  <p className="small">New photos may not be saved. Sync your queue, then remove photos of reports that are already accepted. Unsent evidence is never deleted automatically.</p>
                </Banner>
              </div>
            ) : null}
          </div>
        )}
        <p className="small muted">
          Browsers can remove site data when space is short. {persisted ? "This device has agreed to keep this app's data indefinitely." : persisted === false ? "The browser has not promised to keep this data; sync reports as soon as you can." : ""}
        </p>
        <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          {persisted === false ? <Button size="small" onClick={() => void askPersist()}>Ask the browser to keep my data</Button> : null}
          <Button
            size="small"
            onClick={async () => {
              if (!db || !ownerId) return;
              const r = await cleanupSyncedMedia(db, ownerId);
              announce(`Removed ${r.removed} photos (${formatBytes(r.bytes)}) of accepted reports from this device`);
            }}
          >
            Remove photos of accepted reports
          </Button>
        </div>
      </div>
    </Card>
  );
}

function OperationRow({ op }: { op: OperationRecord }) {
  const { db, ownerId, syncNow, syncing } = useOffline();
  const router = useRouter();
  const now = useNow(15_000);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const payload = isReportPayload(op.payload) ? op.payload : null;
  const title = payload ? `${humanize(payload.reportType)} · ${humanize(payload.severity)}` : "Unreadable report";
  const canRetry = op.state === "QUEUED" || op.state === "RETRY_WAIT";
  const hasPhotos = (payload?.mediaLocalIds.length ?? 0) > 0 && !op.textOnly;
  const refCode = `OP-${op.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  // SMS fallback href
  const smsNumber = fieldSmsNumber();
  const smsLink =
    smsNumber && payload && op.state !== "SYNCED"
      ? smsHref(smsNumber, buildSmsReport(payload, { ref: refCode.slice(3, 9), chainage: payload.location ? snapToCorridor(payload.location.latitude, payload.location.longitude).formattedChainage : null }))
      : null;

  return (
    <li className="card" style={{ padding: "0.9rem 1rem", borderLeft: op.state === "SYNCED" ? "4px solid #16a34a" : op.state === "NEEDS_LOGIN" ? "4px solid #dc2626" : op.state === "RETRY_WAIT" ? "4px solid #f59e0b" : "4px solid #0284c7" }}>
      <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: "0.45rem" }}>
        <span style={{ fontWeight: 800, fontSize: "0.78rem", background: "#f1f5f9", color: "#334155", padding: "0.2rem 0.5rem", borderRadius: "6px" }}>
          {refCode}
        </span>
        <strong>{title}</strong>
        <StatusBadge kind="queue" value={op.state} />
        {op.textOnly ? (
          <span style={{ fontSize: "0.72rem", background: "#e2e8f0", color: "#475569", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
            Text only
          </span>
        ) : (payload?.mediaLocalIds.length ?? 0) > 0 ? (
          <span style={{ fontSize: "0.72rem", background: "#dbeafe", color: "#1d4ed8", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
            📷 {payload?.mediaLocalIds.length} photo(s)
          </span>
        ) : null}
        {payload?.location && (
          <span style={{ fontSize: "0.72rem", background: "#f0fdf4", color: "#166534", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
            📍 GPS Fix
          </span>
        )}
        <span className="small muted right">Saved {formatAge(op.createdAt, now)}</span>
      </div>

      {payload ? (
        <p className="small" style={{ margin: "0.4rem 0 0.2rem", color: "#334155", lineHeight: 1.4 }}>
          {payload.description.slice(0, 160)}
        </p>
      ) : null}

      <div style={{ marginTop: "0.3rem" }}>
        <p className="small" style={{ margin: 0, color: "#64748b" }}>{STATE_REMEDY[op.state]}</p>
        {op.lastError ? (
          <p className="small" role="status" style={{ margin: "0.2rem 0 0", color: "#dc2626", fontWeight: 500 }}>
            Last problem ({formatDateTime(op.lastError.at)}): {op.lastError.message}
            {op.lastError.httpStatus ? ` (HTTP ${op.lastError.httpStatus})` : ""}
          </p>
        ) : null}
        {op.state === "RETRY_WAIT" && op.nextAttemptAt ? (
          <p className="small muted" style={{ margin: "0.2rem 0 0" }}>
            Next automatic attempt {new Date(op.nextAttemptAt).getTime() <= now.getTime() ? "is due" : `in about ${Math.max(1, Math.round((new Date(op.nextAttemptAt).getTime() - now.getTime()) / 1000))} s`} · attempt {op.attempts}
          </p>
        ) : null}
        {smsLink ? (
          <p className="small muted" style={{ margin: "0.25rem 0 0" }}>
            No data signal? &ldquo;Send by SMS&rdquo; opens your SMS app with a compressed dispatch string for control room staff.
          </p>
        ) : null}
        {op.serverResult ? (
          <p className="small" style={{ margin: "0.25rem 0 0", color: "#166534" }}>
            Server review state: <strong>{humanize(op.serverResult.reviewState)}</strong>
          </p>
        ) : null}
      </div>

      <div className="row" style={{ marginTop: "0.6rem", flexWrap: "wrap", gap: "0.4rem" }}>
        {canRetry ? <Button size="small" variant="primary" onClick={() => void syncNow()} disabled={syncing}>Sync now</Button> : null}
        {op.state === "NEEDS_LOGIN" ? <Link className="btn small primary" href="/login?reason=expired">Sign in to send</Link> : null}
        {smsLink ? <a className="btn small" href={smsLink} title="Opens SMS with coded report for the control room">Send by SMS</a> : null}
        {hasPhotos && (op.state === "RETRY_WAIT" || op.state === "NEEDS_REVIEW" || op.state === "FAILED_WITH_REASON") ? (
          <Button size="small" onClick={async () => { if (db && ownerId) { await updateOperation(db, ownerId, op.id, { textOnly: true, state: "QUEUED", lastError: null, attempts: 0, nextAttemptAt: null }); void syncNow(); } }}>
            Send without photos
          </Button>
        ) : null}
        {op.state === "NEEDS_REVIEW" || op.state === "FAILED_WITH_REASON" ? (
          <Button size="small" onClick={async () => { if (db && ownerId) { const id = await reopenAsDraft(db, ownerId, op.id); if (id) router.push(`/field/report/new?draft=${id}`); } }}>
            Edit report
          </Button>
        ) : null}
        {op.state === "SYNCED" && op.serverResult ? (
          <Link className="btn small" href={`/field/reports/${op.serverResult.reportId}`}>
            View on server
          </Link>
        ) : null}
        {op.state !== "SYNCED" ? (
          confirmDiscard ? (
            <>
              <Button size="small" variant="danger" onClick={async () => { if (db && ownerId) await discardOperation(db, ownerId, op.id); }}>Yes, discard this unsent report</Button>
              <Button size="small" onClick={() => setConfirmDiscard(false)}>Keep it</Button>
            </>
          ) : (
            <Button size="small" onClick={() => setConfirmDiscard(true)}>Discard…</Button>
          )
        ) : null}
      </div>
    </li>
  );
}

export function SyncQueue() {
  const { snapshot, syncNow, syncing, lastSummary, lastSyncAt, error, ready, db, ownerId, simulatedOffline, toggleSimulatedOffline } = useOffline();
  const now = useNow(15_000);
  const [discardId, setDiscardId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));

  // Network connectivity listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (error) return <Banner tone="danger" title="Offline storage is unavailable"><p className="small">{error}. Reports cannot be saved on this device. Private browsing or blocked site data are common causes. Use a normal window, or submit only while online.</p></Banner>;
  if (!ready || !snapshot) return <p role="status" className="muted">Opening local storage…</p>;

  // 3-Metric Calculation
  const pendingOps = snapshot.operations.filter((o) => o.state === "QUEUED" || o.state === "RETRY_WAIT" || o.state === "NEEDS_REVIEW" || o.state === "FAILED_WITH_REASON");
  const inFlightOps = snapshot.operations.filter((o) => o.state === "UPLOADING_MEDIA" || o.state === "SUBMITTING");
  const syncedOps = snapshot.operations.filter((o) => o.state === "SYNCED");
  const needsLoginOps = snapshot.operations.filter((o) => o.state === "NEEDS_LOGIN");

  const pendingCount = pendingOps.length;
  const inFlightCount = inFlightOps.length + (syncing && pendingCount > 0 ? 1 : 0);
  const syncedCount = syncedOps.length;
  const effectiveOnline = isOnline && !simulatedOffline;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      {/* Network & Tactical Status Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.6rem",
          background: effectiveOnline ? "#f0fdf4" : "#fff7ed",
          border: effectiveOnline ? "1px solid #86efac" : "1px solid #fed7aa",
          padding: "0.75rem 1rem",
          borderRadius: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "1.1rem" }}>{effectiveOnline ? "🟢" : "🟠"}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.92rem", color: effectiveOnline ? "#166534" : "#9a3412" }}>
              {effectiveOnline ? "Online · Server Connectivity Active" : "Offline · Local Storage Engine Active"}
            </div>
            <div style={{ fontSize: "0.75rem", color: effectiveOnline ? "#15803d" : "#c2410c" }}>
              {effectiveOnline
                ? "Reports will automatically transmit to Regional Command as signal permits."
                : "All reports and evidence are stored safely in device IndexedDB until network returns."}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {simulatedOffline ? (
            <button
              type="button"
              className="btn small"
              onClick={toggleSimulatedOffline}
              style={{ background: "#ea580c", color: "#fff", border: "none" }}
            >
              Disable Simulation
            </button>
          ) : null}
          <Button variant="primary" size="small" onClick={() => void syncNow()} busy={syncing}>
            {syncing ? "Transmitting…" : "Sync Now"}
          </Button>
        </div>
      </div>

      {/* Session Expired Banner if any report needs login */}
      {needsLoginOps.length > 0 && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "12px",
            padding: "0.9rem 1.1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.6rem",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, color: "#991b1b", fontSize: "0.92rem" }}>
              ⚠️ Session Expired · {needsLoginOps.length} Report(s) Blocked
            </div>
            <div style={{ fontSize: "0.78rem", color: "#b91c1c", marginTop: "0.15rem" }}>
              Your authentication token expired while in the field. Sign in again to resume transmission without losing any unsent evidence.
            </div>
          </div>
          <Link className="btn small primary" href="/login?reason=expired" style={{ background: "#dc2626", borderColor: "#dc2626" }}>
            Sign In to Resume
          </Link>
        </div>
      )}

      {/* 3-Metric Tactical Stat Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.85rem 1rem", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Pending In Queue</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: pendingCount > 0 ? "#ea580c" : "#0f172a", marginTop: "0.15rem" }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Waiting for connection</div>
        </div>

        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.85rem 1rem", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>In-Flight / Transmitting</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: inFlightCount > 0 ? "#0284c7" : "#0f172a", marginTop: "0.15rem" }}>
            {inFlightCount}
          </div>
          <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Active network transfer</div>
        </div>

        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.85rem 1rem", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Synced To Server</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#16a34a", marginTop: "0.15rem" }}>
            {syncedCount}
          </div>
          <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Accepted by Command</div>
        </div>
      </div>

      {snapshot.otherAccountPending > 0 ? (
        <Banner tone="warn" title="Another account has unsent reports on this device">
          <p className="small">{snapshot.otherAccountPending} report(s) belong to a different user. They are hidden from you and will only send when that user signs in. You cannot read or send them.</p>
        </Banner>
      ) : null}

      {/* Sync Summary Info */}
      <div style={{ fontSize: "0.8rem", color: "#64748b", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem", padding: "0 0.25rem" }}>
        <span>
          {lastSyncAt ? `Last sync handshake: ${formatAge(lastSyncAt, now)}` : "No sync attempt completed yet this session"}
          {lastSummary ? ` (${lastSummary.synced} accepted, ${lastSummary.retryWait} waiting retry)` : ""}
        </span>
        <span>{snapshot.drafts.length} in-progress draft(s)</span>
      </div>

      {/* In-progress Drafts */}
      {snapshot.drafts.length ? (
        <Card title="Unfinished Drafts">
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.5rem" }}>
            {snapshot.drafts.map(({ draft, payload }) => (
              <li key={draft.id} className="row card" style={{ padding: "0.65rem 0.9rem", alignItems: "center" }}>
                <StatusBadge kind="queue" value="DRAFT" />
                <strong style={{ fontSize: "0.9rem" }}>{payload.reportType ? humanize(payload.reportType) : "Not yet classified"}</strong>
                <span className="small muted">edited {formatAge(draft.updatedAt, now)}</span>
                <span className="right row" style={{ gap: "0.4rem" }}>
                  <Link className="btn small primary" href={`/field/report/new?draft=${draft.id}`}>Continue</Link>
                  {discardId === draft.id ? (
                    <Button size="small" variant="danger" onClick={async () => { if (db && ownerId) await discardDraft(db, ownerId, draft.id); setDiscardId(null); }}>Confirm discard</Button>
                  ) : (
                    <Button size="small" onClick={() => setDiscardId(draft.id)}>Discard…</Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Reports on this device */}
      <Card title={`Local Outbox (${snapshot.operations.length})`}>
        {snapshot.operations.length === 0 ? (
          <p className="muted" style={{ margin: "0.5rem 0" }}>No reports currently queued on this device.</p>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.75rem" }}>
            {snapshot.operations.map((op) => <OperationRow key={op.id} op={op} />)}
          </ul>
        )}
      </Card>

      <StorageStatusPanel />
    </div>
  );
}
