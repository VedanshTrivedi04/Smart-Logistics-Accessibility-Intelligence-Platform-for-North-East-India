"use client";

import { useEffect, useState } from "react";
import { readSnapshot, saveSnapshot, type Snapshot } from "@/shared/offline/snapshots";
import { useOffline } from "./OfflineProvider";

export interface SnapshotResult<T> {
  /** Live data when the server answered, otherwise the last copy saved on this device. */
  data: T | undefined;
  /** When `data` was fetched from the server, or null if there is none. */
  asOf: Date | null;
  /** True when `data` is a saved copy because the live request has not succeeded. */
  fromDevice: boolean;
}

/**
 * Wraps a query so its last successful result is saved on the device and shown when the network is
 * unavailable. Live data always wins; a saved copy is only used while there is no live data.
 */
export function useOfflineSnapshot<T>(name: string, query: { data: T | undefined; dataUpdatedAt: number }): SnapshotResult<T> {
  const { db, ownerId } = useOffline();
  const [saved, setSaved] = useState<Snapshot<T> | null>(null);

  useEffect(() => {
    if (!db || !ownerId) return;
    let cancelled = false;
    void readSnapshot<T>(ownerId, name, db).then((s) => !cancelled && setSaved(s));
    return () => {
      cancelled = true;
    };
  }, [db, ownerId, name]);

  const live = query.data;
  const updatedAt = query.dataUpdatedAt;
  useEffect(() => {
    if (live === undefined || !db || !ownerId) return;
    const at = new Date(updatedAt || Date.now());
    void saveSnapshot(ownerId, name, live, at, db).catch(() => undefined);
  }, [live, updatedAt, db, ownerId, name]);

  if (live !== undefined) return { data: live, asOf: new Date(updatedAt || Date.now()), fromDevice: false };
  if (saved) return { data: saved.data, asOf: new Date(saved.savedAt), fromDevice: true };
  return { data: undefined, asOf: null, fromDevice: false };
}
