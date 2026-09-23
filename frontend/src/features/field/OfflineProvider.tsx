"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "@/shared/auth";
import { getOfflineDb, QUEUE_CHANGED, queueEvents, readStorageStatus, requestPersistentStorage, type OfflineDb, type StorageStatus } from "@/shared/offline";
import { readSnapshot, type QueueSnapshot } from "./store";
import { runSync, type SyncSummary } from "./sync/engine";
import { httpTransport, isSimulatedOffline, setSimulatedOffline } from "./sync/transport";

interface OfflineValue {
  ready: boolean;
  /** Set when IndexedDB is unavailable (private mode, blocked). Offline capture cannot work then. */
  error: string | null;
  db: OfflineDb | null;
  ownerId: string | null;
  orgId: string | null;
  snapshot: QueueSnapshot | null;
  syncing: boolean;
  lastSummary: SyncSummary | null;
  lastSyncAt: Date | null;
  storage: StorageStatus | null;
  persisted: boolean | null;
  simulatedOffline: boolean;
  toggleSimulatedOffline: () => void;
  /** Explicit sync now: ignores backoff delays. */
  syncNow: () => Promise<void>;
  refresh: () => Promise<void>;
  askPersist: () => Promise<void>;
}

const Ctx = createContext<OfflineValue | null>(null);

export function useOffline(): OfflineValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOffline must be used inside FieldOfflineProvider");
  return v;
}

const BG_SYNC_TAG = "ner-report-sync";

/** Ask for optional Background Sync where supported. It is an extra trigger only; the UI never depends on it. */
export async function requestBackgroundSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } } | undefined)?.sync;
    await sync?.register(BG_SYNC_TAG);
  } catch {
    /* unsupported or denied */
  }
}

export function FieldOfflineProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const principal = session.principal;
  const ownerId = principal?.user_id ?? null;
  const orgId = principal?.org_id ?? null;
  const verified = session.status === "authenticated" && !session.offlineCached;

  const [db, setDb] = useState<OfflineDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSummary, setLastSummary] = useState<SyncSummary | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getOfflineDb().then(
      (d) => !cancelled && setDb(d),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Local storage is unavailable"),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!db || !ownerId) return;
    setSnapshot(await readSnapshot(db, ownerId));
    setStorage(await readStorageStatus());
  }, [db, ownerId]);

  useEffect(() => {
    void refresh();
    queueEvents.addEventListener(QUEUE_CHANGED, refresh);
    return () => queueEvents.removeEventListener(QUEUE_CHANGED, refresh);
  }, [refresh]);

  const sync = useCallback(
    async (force: boolean) => {
      if (!db || !ownerId || !verified || busy.current) return;
      busy.current = true;
      setSyncing(true);
      try {
        const summary = await runSync({ db, ownerId, transport: httpTransport, force });
        setLastSummary(summary);
        setLastSyncAt(new Date());
      } finally {
        busy.current = false;
        setSyncing(false);
        await refresh();
      }
    },
    [db, ownerId, verified, refresh],
  );

  const syncNow = useCallback(() => sync(true), [sync]);

  // Triggers: app open/resume, network-recovery hint, due retries, service-worker background sync.
  useEffect(() => {
    if (!db || !verified) return;
    void sync(false);
    const onVisible = () => document.visibilityState === "visible" && void sync(false);
    const onOnline = () => void sync(false); // navigator.onLine is a hint; request outcomes decide.
    const onMessage = (e: MessageEvent) => (e.data as { type?: string } | null)?.type === "ner-sync" && void sync(false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    const timer = setInterval(() => void sync(false), 15_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
  }, [db, verified, sync]);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const askPersist = useCallback(async () => {
    setPersisted(await requestPersistentStorage());
  }, []);

  const [simulatedOffline, setSimState] = useState(isSimulatedOffline());

  const toggleSimulatedOffline = useCallback(() => {
    const next = !isSimulatedOffline();
    setSimulatedOffline(next);
    setSimState(next);
    if (!next) {
      void sync(true);
    }
  }, [sync]);

  const value = useMemo<OfflineValue>(
    () => ({ ready: db !== null && snapshot !== null, error, db, ownerId, orgId, snapshot, syncing, lastSummary, lastSyncAt, storage, persisted, simulatedOffline, toggleSimulatedOffline, syncNow, refresh, askPersist }),
    [db, error, ownerId, orgId, snapshot, syncing, lastSummary, lastSyncAt, storage, persisted, simulatedOffline, toggleSimulatedOffline, syncNow, refresh, askPersist],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
