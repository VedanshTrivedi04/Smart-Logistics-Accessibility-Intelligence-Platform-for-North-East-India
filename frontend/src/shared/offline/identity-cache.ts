import type { Principal } from "@/shared/api/types";
import { getOfflineDb, type OfflineDb } from "./db";

const KEY = "last_principal";

/**
 * The last identity confirmed by the server, kept only so the same user can
 * reopen their offline queue without a network round trip. It holds no session
 * secret. It is deleted on explicit logout so another person on a shared device
 * cannot resume this identity's UI.
 */
export async function saveCachedPrincipal(principal: Principal, db?: OfflineDb): Promise<void> {
  const handle = db ?? (await getOfflineDb());
  await handle.put("sync_metadata", { key: KEY, ownerId: principal.user_id, value: principal });
}

export async function readCachedPrincipal(db?: OfflineDb): Promise<Principal | null> {
  try {
    const handle = db ?? (await getOfflineDb());
    const row = await handle.get("sync_metadata", KEY);
    return (row?.value as Principal | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearCachedPrincipal(db?: OfflineDb): Promise<void> {
  try {
    const handle = db ?? (await getOfflineDb());
    await handle.delete("sync_metadata", KEY);
  } catch {
    /* nothing to clear */
  }
}
