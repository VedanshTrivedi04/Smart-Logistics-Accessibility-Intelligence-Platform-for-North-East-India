import { backoffDelayMs, classifyFailure, type OfflineDb, type OperationRecord } from "@/shared/offline";
import { isReportPayload, toBatchItem } from "../model";
import { getOperation, listMedia, listOperations, updateOperation } from "../store";
import { sha256Hex } from "./media";
import { TransportError, type SyncTransport } from "./transport";

export interface EngineDeps {
  db: OfflineDb;
  ownerId: string;
  transport: SyncTransport;
  now?: () => Date;
  rng?: () => number;
  sha256?: (blob: Blob) => Promise<string>;
  /** Ignore RETRY_WAIT delays (explicit "Sync now"). */
  force?: boolean;
  appInstanceId?: string;
}

export interface SyncSummary {
  attempted: number;
  synced: number;
  retryWait: number;
  needsLogin: number;
  needsReview: number;
  failed: number;
}

const BATCH_MAX = 50;
/** After this many scan-pending retries the officer is asked to decide instead of waiting forever. */
const SCAN_RETRY_LIMIT = 4;

let running = false;

interface ItemFailure {
  client_operation_id: string;
  status_code: number;
  error_code?: string;
  message?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseSuccess(v: unknown): { id: string; reportId: string; reviewState: string } | null {
  if (!isRecord(v) || typeof v["client_operation_id"] !== "string" || typeof v["report_id"] !== "string") return null;
  return { id: v["client_operation_id"], reportId: v["report_id"], reviewState: typeof v["review_state"] === "string" ? v["review_state"] : "SUBMITTED" };
}

function parseFailure(v: unknown): ItemFailure | null {
  if (!isRecord(v) || typeof v["client_operation_id"] !== "string") return null;
  return {
    client_operation_id: v["client_operation_id"],
    status_code: typeof v["status_code"] === "number" ? v["status_code"] : 400,
    ...(typeof v["error_code"] === "string" ? { error_code: v["error_code"] } : {}),
    ...(typeof v["message"] === "string" ? { message: v["message"] } : {}),
  };
}

/**
 * One synchronization pass for the signed-in user's queue.
 *
 * Rules taken from the frontend handover: media is uploaded before the report is
 * submitted and only fully confirmed uploads are attached; the operation id never
 * changes across retries so the server can deduplicate; success is decided from the
 * server's per-item result, never from the overall HTTP status; transient failures back
 * off with jitter, while forbidden/invalid payloads are not retried blindly.
 */
export async function runSync(deps: EngineDeps): Promise<SyncSummary> {
  const summary: SyncSummary = { attempted: 0, synced: 0, retryWait: 0, needsLogin: 0, needsReview: 0, failed: 0 };
  if (running) return summary;
  running = true;
  try {
    return await pass(deps, summary);
  } finally {
    running = false;
  }
}

async function pass(deps: EngineDeps, summary: SyncSummary): Promise<SyncSummary> {
  const { db, ownerId, transport } = deps;
  const now = deps.now ?? (() => new Date());
  const hash = deps.sha256 ?? sha256Hex;

  const record = async (op: OperationRecord, err: TransportError) => {
    const info = classifyFailure(err.status, err.code);
    let state = info.state;
    const scanPending = err.code === "MEDIA_SCAN_PENDING_OR_REJECTED";
    if (scanPending) state = op.attempts + 1 >= SCAN_RETRY_LIMIT ? "NEEDS_REVIEW" : "RETRY_WAIT";
    const attempts = op.attempts + 1;
    await updateOperation(db, ownerId, op.id, {
      state,
      attempts,
      nextAttemptAt: state === "RETRY_WAIT" ? new Date(now().getTime() + backoffDelayMs(attempts, { rng: deps.rng ?? Math.random })).toISOString() : null,
      lastError: { code: err.code ?? (err.status === 0 ? "NETWORK_UNREACHABLE" : `HTTP_${err.status}`), message: scanPending && state === "NEEDS_REVIEW" ? "The photo could not be cleared by the safety scan. Send the report without photos, or edit it." : err.message, ...(err.status ? { httpStatus: err.status } : {}), at: now().toISOString() },
    });
    if (state === "RETRY_WAIT") summary.retryWait++;
    else if (state === "NEEDS_LOGIN") summary.needsLogin++;
    else if (state === "NEEDS_REVIEW") summary.needsReview++;
    else summary.failed++;
  };

  // The caller is authenticated as ownerId, so sessions that ended earlier can resume.
  for (const op of await listOperations(db, ownerId)) {
    if (op.state === "NEEDS_LOGIN") await updateOperation(db, ownerId, op.id, { state: "QUEUED", lastError: null });
  }

  const nowMs = now().getTime();
  const due = (await listOperations(db, ownerId))
    .filter((o) => o.state === "QUEUED" || o.state === "UPLOADING_MEDIA" || o.state === "SUBMITTING" || (o.state === "RETRY_WAIT" && (deps.force || !o.nextAttemptAt || new Date(o.nextAttemptAt).getTime() <= nowMs)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const ready: Array<{ op: OperationRecord; item: Record<string, unknown> }> = [];

  for (const stored of due) {
    summary.attempted++;
    let op = stored;
    if (!isReportPayload(op.payload)) {
      await record(op.state === "QUEUED" ? ((await updateOperation(db, ownerId, op.id, { state: "SUBMITTING" })) ?? op) : op, new TransportError(422, "Stored report is unreadable", "LOCAL_CORRUPT"));
      continue;
    }
    const payload = op.payload;
    const media = await listMedia(db, ownerId, { operationId: op.id });
    const pendingUploads = op.textOnly ? [] : media.filter((m) => !m.serverMediaId);

    if (pendingUploads.length) {
      op = (await updateOperation(db, ownerId, op.id, { state: "UPLOADING_MEDIA" })) ?? op;
      try {
        for (const m of pendingUploads) {
          const ticket = await transport.requestUploadTicket({ fileName: m.fileName, sizeBytes: m.size, mimeType: m.mimeType, sha256: await hash(m.blob) });
          await transport.putObject(ticket.uploadUrl, m.blob, m.mimeType);
          await transport.confirmUpload(ticket.mediaId, {});
          // Record progress per file so an interrupted run never re-uploads confirmed photos.
          await db.put("local_media", { ...m, serverMediaId: ticket.mediaId });
        }
      } catch (e) {
        await record(op, e instanceof TransportError ? e : new TransportError(0, e instanceof Error ? e.message : "Upload failed"));
        continue;
      }
    }

    const fresh = (await getOperation(db, ownerId, op.id)) ?? op;
    op = (await updateOperation(db, ownerId, op.id, { state: "SUBMITTING" })) ?? fresh;
    const mediaIds = op.textOnly ? [] : (await listMedia(db, ownerId, { operationId: op.id })).map((m) => m.serverMediaId).filter((id): id is string => Boolean(id));
    ready.push({ op, item: toBatchItem(op, payload, mediaIds) });
  }

  for (let i = 0; i < ready.length; i += BATCH_MAX) {
    const chunk = ready.slice(i, i + BATCH_MAX);
    let response;
    try {
      response = await transport.syncBatch(chunk.map((c) => c.item), deps.appInstanceId ? { appInstanceId: deps.appInstanceId } : {});
    } catch (e) {
      const err = e instanceof TransportError ? e : new TransportError(0, e instanceof Error ? e.message : "Sync failed");
      for (const c of chunk) await record(c.op, err);
      continue;
    }
    const ok = new Map(response.succeeded.map(parseSuccess).filter((x): x is NonNullable<typeof x> => x !== null).map((s) => [s.id, s]));
    const bad = new Map(response.failed.map(parseFailure).filter((x): x is ItemFailure => x !== null).map((f) => [f.client_operation_id, f]));
    for (const { op } of chunk) {
      const success = ok.get(op.id);
      const failure = bad.get(op.id);
      if (success) {
        await updateOperation(db, ownerId, op.id, { state: "SYNCED", serverResult: { reportId: success.reportId, reviewState: success.reviewState }, lastError: null, nextAttemptAt: null });
        summary.synced++;
      } else if (failure) {
        await record(op, new TransportError(failure.status_code, failure.message ?? "The server rejected this report", failure.error_code));
      } else {
        // No per-item answer: never guess success. Keep it queued and retry with the same id.
        await record(op, new TransportError(0, "The server response did not mention this report", "NO_ITEM_RESULT"));
      }
    }
  }
  return summary;
}
