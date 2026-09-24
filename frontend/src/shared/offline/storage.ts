export interface StorageStatus {
  supported: boolean;
  usageBytes: number;
  quotaBytes: number;
  ratio: number;
  persisted: boolean | null;
  level: "ok" | "warning" | "critical" | "unknown";
}

export function levelFor(ratio: number): StorageStatus["level"] {
  if (ratio >= 0.95) return "critical";
  if (ratio >= 0.8) return "warning";
  return "ok";
}

export async function readStorageStatus(): Promise<StorageStatus> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { supported: false, usageBytes: 0, quotaBytes: 0, ratio: 0, persisted: null, level: "unknown" };
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const ratio = quota > 0 ? usage / quota : 0;
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
  return { supported: true, usageBytes: usage, quotaBytes: quota, ratio, persisted, level: quota > 0 ? levelFor(ratio) : "unknown" };
}

/** Ask the browser not to evict local evidence. It may still refuse; callers must say so. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function isQuotaError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name: string }).name === "QuotaExceededError";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
