"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { humanize } from "@/shared/lib/format";
import { formatAge, formatDateTime } from "@/shared/lib/time";
import { useNow } from "@/shared/lib/useNow";
import { formatBytes, STATE_REMEDY, type OperationRecord } from "@/shared/offline";
import { Banner, Button, Card, StatusBadge, useAnnounce } from "@/shared/ui";
import { isReportPayload } from "./model";
import { useOffline } from "./OfflineProvider";
import { cleanupSyncedMedia, discardDraft, discardOperation, reopenAsDraft, updateOperation } from "./store";

export function StorageStatusPanel() {
  const { storage, persisted, askPersist, db, ownerId } = useOffline();
  const announce = useAnnounce();
  if (!storage) return null;
  return (
    <Card title="Storage on this device">
      <div className="stack">
        {!storage.supported ? (
          <Banner tone="warn" title="Storage usage cannot be measured"><p className="small">This browser does not report storage quota, so a full device cannot be predicted. Sync often.</p></Banner>
        ) : (
          <>
            <p>
              Using {formatBytes(storage.usageBytes)} of about {formatBytes(storage.quotaBytes)} ({Math.round(storage.ratio * 100)}%).
            </p>
            {storage.level === "warning" || storage.level === "critical" ? (
              <Banner tone={storage.level === "critical" ? "danger" : "warn"} title={storage.level === "critical" ? "Storage is almost full" : "Storage is getting full"}>
                <p className="small">New photos may not be saved. Sync your queue, then remove photos of reports that are already accepted. Unsent evidence is never deleted automatically.</p>
              </Banner>
            ) : null}
          </>
        )}
        <p className="small muted">
          Browsers can remove site data when space is short. {persisted ? "This device has agreed to keep this app's data." : persisted === false ? "The browser has not promised to keep this data; sync reports as soon as you can." : ""}
        </p>
        <div className="row">
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

  return (
    <li className="card" style={{ padding: "0.8rem" }}>
      <div className="row">
        <strong>{title}</strong>
        <StatusBadge kind="queue" value={op.state} />
        {op.textOnly ? <span className="badge tone-neutral">Text only</span> : null}
        <span className="small muted right">Saved {formatAge(op.createdAt, now)}</span>
      </div>
      {payload ? <p className="small" style={{ margin: "0.3rem 0" }}>{payload.description.slice(0, 140)}</p> : null}
      <p className="small">{STATE_REMEDY[op.state]}</p>
      {op.lastError ? (
        <p className="small" role="status">
          Last problem ({formatDateTime(op.lastError.at)}): {op.lastError.message}
          {op.lastError.httpStatus ? ` (HTTP ${op.lastError.httpStatus})` : ""}
        </p>
      ) : null}
      {op.state === "RETRY_WAIT" && op.nextAttemptAt ? <p className="small muted">Next automatic attempt {new Date(op.nextAttemptAt).getTime() <= now.getTime() ? "is due" : `in about ${Math.max(1, Math.round((new Date(op.nextAttemptAt).getTime() - now.getTime()) / 1000))} s`} · attempt {op.attempts}</p> : null}
      {op.serverResult ? <p className="small">Server review state: <strong>{humanize(op.serverResult.reviewState)}</strong></p> : null}
      <div className="row">
        {canRetry ? <Button size="small" onClick={() => void syncNow()} disabled={syncing}>Sync now</Button> : null}
        {op.state === "NEEDS_LOGIN" ? <Link className="btn small" href="/login?reason=expired">Sign in</Link> : null}
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
        {op.state === "SYNCED" && op.serverResult ? <Link className="btn small" href={`/field/reports/${op.serverResult.reportId}`}>View on server</Link> : null}
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
  const { snapshot, syncNow, syncing, lastSummary, lastSyncAt, error, ready, db, ownerId } = useOffline();
  const now = useNow(15_000);
  const [discardId, setDiscardId] = useState<string | null>(null);
  if (error) return <Banner tone="danger" title="Offline storage is unavailable"><p className="small">{error}. Reports cannot be saved on this device. Private browsing or blocked site data are common causes. Use a normal window, or submit only while online.</p></Banner>;
  if (!ready || !snapshot) return <p role="status" className="muted">Opening local storage…</p>;
  const pending = snapshot.operations.filter((o) => o.state !== "SYNCED").length;

  return (
    <div className="stack">
      {snapshot.otherAccountPending > 0 ? (
        <Banner tone="warn" title="Another account has unsent reports on this device">
          <p className="small">{snapshot.otherAccountPending} report(s) belong to a different user. They are hidden from you and will only send when that user signs in. You cannot read or send them.</p>
        </Banner>
      ) : null}
      <Card
        title="Send queue"
        actions={<Button variant="primary" onClick={() => void syncNow()} busy={syncing}>Sync now</Button>}
      >
        <p className="small muted">
          {pending} waiting · {snapshot.drafts.length} draft(s). {lastSyncAt ? `Last attempt ${formatAge(lastSyncAt, now)}` : "No sync attempt yet this session"}
          {lastSummary ? ` — ${lastSummary.synced} accepted, ${lastSummary.retryWait} will retry, ${lastSummary.needsLogin} need sign-in, ${lastSummary.failed} rejected.` : "."}
        </p>
        <p className="small muted">A report counts as submitted only after the server accepts it. Until then it is saved on this device.</p>
      </Card>

      {snapshot.drafts.length ? (
        <Card title="Drafts">
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {snapshot.drafts.map(({ draft, payload }) => (
              <li key={draft.id} className="row card" style={{ padding: "0.6rem 0.8rem" }}>
                <StatusBadge kind="queue" value="DRAFT" />
                <span>{payload.reportType ? humanize(payload.reportType) : "Not yet classified"}</span>
                <span className="small muted">edited {formatAge(draft.updatedAt, now)}</span>
                <span className="right row">
                  <Link className="btn small" href={`/field/report/new?draft=${draft.id}`}>Continue</Link>
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

      <Card title="Reports on this device">
        {snapshot.operations.length === 0 ? <p className="muted">Nothing is queued.</p> : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {snapshot.operations.map((op) => <OperationRow key={op.id} op={op} />)}
          </ul>
        )}
      </Card>
      <StorageStatusPanel />
    </div>
  );
}
