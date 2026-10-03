import { getOfflineDb, type OfflineDb } from "./db";

/**
 * Last-known copies of read-only server data (nearby reports, incidents, road status), kept so the field
 * screens still show something useful with no signal. They live in the existing `sync_metadata` store, so no
 * schema change is needed.
 *
 * Rules: one owner per row (a second user on the same device never sees them), removed on sign-out, and
 * always shown with the time they were fetched. The service worker still never caches /api responses.
 */
const PREFIX = "snapshot:";

export interface Snapshot<T> {
  /** ISO time the data was fetched from the server. */
  savedAt: string;
  data: T;
}

const rowKey = (ownerId: string, name: string) => `${PREFIX}${ownerId}:${name}`;

export async function saveSnapshot<T>(ownerId: string, name: string, data: T, now = new Date(), db?: OfflineDb): Promise<void> {
  const handle = db ?? (await getOfflineDb());
  const value: Snapshot<T> = { savedAt: now.toISOString(), data };
  await handle.put("sync_metadata", { key: rowKey(ownerId, name), ownerId, value });
}

export async function readSnapshot<T>(ownerId: string, name: string, db?: OfflineDb): Promise<Snapshot<T> | null> {
  try {
    const handle = db ?? (await getOfflineDb());
    const row = await handle.get("sync_metadata", rowKey(ownerId, name));
    // Defence in depth: a row that names another owner is never returned.
    if (!row || row.ownerId !== ownerId) return null;
    return row.value as Snapshot<T>;
  } catch {
    return null;
  }
}

/** Remove every snapshot (all owners) or just one owner's. Called on sign-out. */
export async function clearSnapshots(ownerId?: string, db?: OfflineDb): Promise<void> {
  try {
    const handle = db ?? (await getOfflineDb());
    const prefix = ownerId ? `${PREFIX}${ownerId}:` : PREFIX;
    const tx = handle.transaction("sync_metadata", "readwrite");
    const keys = await tx.store.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`));
    await Promise.all(keys.map((k) => tx.store.delete(k)));
    await tx.done;
  } catch {
    /* nothing to clear */
  }
}
