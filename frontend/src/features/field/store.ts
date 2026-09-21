import { isQuotaError, notifyQueueChanged, type DraftRecord, type LocalMediaRecord, type OfflineDb, type OperationRecord, type OpState } from "@/shared/offline";
import { assertTransition } from "@/shared/offline";
import { emptyPayload, isReportPayload, type ReportPayload } from "./model";

export class StorageFullError extends Error {
  constructor() {
    super("This device is out of storage. Nothing was lost, but the last change was not saved. Free space (for example by removing photos of synced reports) and try again.");
    this.name = "StorageFullError";
  }
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (isQuotaError(e)) throw new StorageFullError();
    throw e;
  }
}

export interface Identity {
  ownerId: string;
  orgId: string;
}

const iso = (d: Date) => d.toISOString();

/** Persist first, then report success: a draft is "saved on device" only after this resolves. */
export async function saveDraft(db: OfflineDb, who: Identity, id: string, payload: ReportPayload, step: number, now = new Date()): Promise<DraftRecord> {
  return guarded(async () => {
    const existing = await db.get("drafts", id);
    if (existing && existing.ownerId !== who.ownerId) throw new Error("This draft belongs to another user");
    const rec: DraftRecord = { id, ownerId: who.ownerId, orgId: who.orgId, kind: "REPORT", payload, step, createdAt: existing?.createdAt ?? iso(now), updatedAt: iso(now) };
    await db.put("drafts", rec);
    notifyQueueChanged();
    return rec;
  });
}

export async function getDraft(db: OfflineDb, ownerId: string, id: string): Promise<{ draft: DraftRecord; payload: ReportPayload } | null> {
  const draft = await db.get("drafts", id);
  if (!draft || draft.ownerId !== ownerId || !isReportPayload(draft.payload)) return null;
  return { draft, payload: draft.payload };
}

export async function listDrafts(db: OfflineDb, ownerId: string): Promise<Array<{ draft: DraftRecord; payload: ReportPayload }>> {
  const rows = await db.getAllFromIndex("drafts", "by_owner", ownerId);
  return rows.filter((d) => isReportPayload(d.payload)).map((draft) => ({ draft, payload: draft.payload as ReportPayload })).sort((a, b) => b.draft.updatedAt.localeCompare(a.draft.updatedAt));
}

export async function newDraft(db: OfflineDb, who: Identity, now = new Date()): Promise<string> {
  const id = crypto.randomUUID();
  await saveDraft(db, who, id, emptyPayload(now), 0, now);
  return id;
}

export async function addMedia(db: OfflineDb, who: Identity, draftId: string, file: Blob, fileName: string, now = new Date()): Promise<LocalMediaRecord> {
  return guarded(async () => {
    const rec: LocalMediaRecord = { id: crypto.randomUUID(), ownerId: who.ownerId, operationId: null, draftId, blob: file, fileName, mimeType: file.type, size: file.size, serverMediaId: null, createdAt: iso(now) };
    await db.put("local_media", rec);
    notifyQueueChanged();
    return rec;
  });
}

export async function listMedia(db: OfflineDb, ownerId: string, ref: { draftId?: string; operationId?: string }): Promise<LocalMediaRecord[]> {
  const rows = ref.draftId ? await db.getAllFromIndex("local_media", "by_draft", ref.draftId) : ref.operationId ? await db.getAllFromIndex("local_media", "by_operation", ref.operationId) : [];
  return rows.filter((m) => m.ownerId === ownerId);
}

export async function removeMedia(db: OfflineDb, ownerId: string, mediaId: string): Promise<void> {
  const m = await db.get("local_media", mediaId);
  if (m && m.ownerId === ownerId) {
    await db.delete("local_media", mediaId);
    notifyQueueChanged();
  }
}

/** Explicitly discard a draft and its photos. Only ever called from a user action. */
export async function discardDraft(db: OfflineDb, ownerId: string, id: string): Promise<void> {
  const tx = db.transaction(["drafts", "local_media"], "readwrite");
  const d = await tx.objectStore("drafts").get(id);
  if (d && d.ownerId === ownerId) {
    await tx.objectStore("drafts").delete(id);
    for (const m of await tx.objectStore("local_media").index("by_draft").getAll(id)) if (m.ownerId === ownerId) await tx.objectStore("local_media").delete(m.id);
  }
  await tx.done;
  notifyQueueChanged();
}

/**
 * Turn a draft into a queued operation in one transaction: either the draft becomes a
 * QUEUED operation with its photos, or nothing changes. The draft id is reused as the
 * operation id so retries stay idempotent.
 */
export async function queueDraft(db: OfflineDb, ownerId: string, id: string, now = new Date()): Promise<OperationRecord> {
  return guarded(async () => {
    const tx = db.transaction(["drafts", "operations", "local_media"], "readwrite");
    const draft = await tx.objectStore("drafts").get(id);
    if (!draft || draft.ownerId !== ownerId || !isReportPayload(draft.payload)) {
      tx.done.catch(() => undefined); // the abort below rejects this promise on purpose
      tx.abort();
      throw new Error("Draft not found");
    }
    const media = (await tx.objectStore("local_media").index("by_draft").getAll(id)).filter((m) => m.ownerId === ownerId);
    const op: OperationRecord = {
      id: draft.id,
      ownerId,
      orgId: draft.orgId,
      kind: "REPORT",
      state: "QUEUED",
      payload: { ...draft.payload, mediaLocalIds: media.map((m) => m.id) },
      localMediaIds: media.map((m) => m.id),
      textOnly: false,
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      serverResult: null,
      createdAt: draft.createdAt,
      updatedAt: iso(now),
    };
    await tx.objectStore("operations").put(op);
    for (const m of media) await tx.objectStore("local_media").put({ ...m, operationId: op.id, draftId: null });
    await tx.objectStore("drafts").delete(id);
    await tx.done;
    notifyQueueChanged();
    return op;
  });
}

export async function listOperations(db: OfflineDb, ownerId: string): Promise<OperationRecord[]> {
  const rows = await db.getAllFromIndex("operations", "by_owner", ownerId);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOperation(db: OfflineDb, ownerId: string, id: string): Promise<OperationRecord | null> {
  const op = await db.get("operations", id);
  return op && op.ownerId === ownerId ? op : null;
}

/** Apply a validated state transition and field changes atomically. */
export async function updateOperation(db: OfflineDb, ownerId: string, id: string, patch: Partial<Omit<OperationRecord, "id" | "ownerId" | "state">> & { state?: OpState }, now = new Date()): Promise<OperationRecord | null> {
  return guarded(async () => {
    const tx = db.transaction("operations", "readwrite");
    const cur = await tx.store.get(id);
    if (!cur || cur.ownerId !== ownerId) {
      await tx.done;
      return null;
    }
    if (patch.state) assertTransition(cur.state, patch.state);
    const next: OperationRecord = { ...cur, ...patch, state: patch.state ?? cur.state, updatedAt: iso(now) };
    await tx.store.put(next);
    await tx.done;
    notifyQueueChanged();
    return next;
  });
}

/** Explicit user discard of an unsent operation and its photos. */
export async function discardOperation(db: OfflineDb, ownerId: string, id: string): Promise<void> {
  const tx = db.transaction(["operations", "local_media"], "readwrite");
  const op = await tx.objectStore("operations").get(id);
  if (op && op.ownerId === ownerId && op.state !== "SYNCED") {
    await tx.objectStore("operations").delete(id);
    for (const m of await tx.objectStore("local_media").index("by_operation").getAll(id)) if (m.ownerId === ownerId) await tx.objectStore("local_media").delete(m.id);
  }
  await tx.done;
  notifyQueueChanged();
}

/** Turn a failed/needs-review operation back into an editable draft. NEEDS_REVIEW gets a fresh operation id. */
export async function reopenAsDraft(db: OfflineDb, ownerId: string, id: string, now = new Date()): Promise<string | null> {
  const tx = db.transaction(["drafts", "operations", "local_media"], "readwrite");
  const op = await tx.objectStore("operations").get(id);
  if (!op || op.ownerId !== ownerId || op.state === "SYNCED" || !isReportPayload(op.payload)) {
    await tx.done;
    return null;
  }
  const newId = op.state === "NEEDS_REVIEW" ? crypto.randomUUID() : op.id;
  const media = await tx.objectStore("local_media").index("by_operation").getAll(id);
  await tx.objectStore("drafts").put({ id: newId, ownerId, orgId: op.orgId, kind: "REPORT", payload: op.payload, step: 4, createdAt: op.createdAt, updatedAt: iso(now) });
  for (const m of media) await tx.objectStore("local_media").put({ ...m, operationId: null, draftId: newId, serverMediaId: op.state === "NEEDS_REVIEW" ? null : m.serverMediaId });
  await tx.objectStore("operations").delete(id);
  await tx.done;
  notifyQueueChanged();
  return newId;
}

/** Delete photos of already-synced reports to free space. Unsent evidence is never touched. */
export async function cleanupSyncedMedia(db: OfflineDb, ownerId: string): Promise<{ removed: number; bytes: number }> {
  const tx = db.transaction(["operations", "local_media"], "readwrite");
  const syncedIds = new Set((await tx.objectStore("operations").index("by_owner").getAll(ownerId)).filter((o) => o.state === "SYNCED").map((o) => o.id));
  let removed = 0;
  let bytes = 0;
  for (const m of await tx.objectStore("local_media").index("by_owner").getAll(ownerId)) {
    if (m.operationId && syncedIds.has(m.operationId)) {
      bytes += m.size;
      removed++;
      await tx.objectStore("local_media").delete(m.id);
    }
  }
  await tx.done;
  notifyQueueChanged();
  return { removed, bytes };
}

export interface QueueSnapshot {
  drafts: Array<{ draft: DraftRecord; payload: ReportPayload }>;
  operations: OperationRecord[];
  media: LocalMediaRecord[];
  /** Pending items belonging to other accounts on this device. Only counts are shown, never contents. */
  otherAccountPending: number;
}

export async function readSnapshot(db: OfflineDb, ownerId: string): Promise<QueueSnapshot> {
  const [drafts, operations, media, allOps] = await Promise.all([listDrafts(db, ownerId), listOperations(db, ownerId), db.getAllFromIndex("local_media", "by_owner", ownerId), db.getAll("operations")]);
  return { drafts, operations, media, otherAccountPending: allOps.filter((o) => o.ownerId !== ownerId && o.state !== "SYNCED").length };
}

/** Explicit removal of everything this user has stored on the device (unsent work included). */
export async function purgeOwner(db: OfflineDb, ownerId: string): Promise<void> {
  const tx = db.transaction(["drafts", "operations", "local_media"], "readwrite");
  for (const store of ["drafts", "operations", "local_media"] as const) {
    for (const key of await tx.objectStore(store).index("by_owner").getAllKeys(ownerId)) await tx.objectStore(store).delete(key);
  }
  await tx.done;
  notifyQueueChanged();
}
