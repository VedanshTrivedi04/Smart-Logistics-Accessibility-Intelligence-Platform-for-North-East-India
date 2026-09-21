import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from "idb";
import type { OpState } from "./queue-state";

export const DB_NAME = "ner-field";
export const SCHEMA_VERSION = 1;

export interface DraftRecord {
  id: string;
  ownerId: string;
  orgId: string;
  kind: "REPORT";
  payload: unknown;
  step: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperationError {
  code: string;
  message: string;
  httpStatus?: number;
  at: string;
}

export interface OperationRecord {
  /** Stable across retries; sent as client_operation_id so the server deduplicates. */
  id: string;
  ownerId: string;
  orgId: string;
  kind: "REPORT";
  state: OpState;
  payload: unknown;
  /** IDs of local_media rows belonging to this operation. */
  localMediaIds: string[];
  /** Explicit user choice to send a text-only urgent report when photos cannot upload. */
  textOnly: boolean;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: OperationError | null;
  serverResult: { reportId: string; reviewState: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalMediaRecord {
  id: string;
  ownerId: string;
  operationId: string | null;
  draftId: string | null;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  serverMediaId: string | null;
  createdAt: string;
}

export interface MetadataRecord {
  key: string;
  ownerId: string | null;
  value: unknown;
}

export interface OfflineSchema extends DBSchema {
  drafts: { key: string; value: DraftRecord; indexes: { by_owner: string } };
  operations: { key: string; value: OperationRecord; indexes: { by_owner: string; by_state: string } };
  local_media: {
    key: string;
    value: LocalMediaRecord;
    indexes: { by_owner: string; by_operation: string; by_draft: string };
  };
  sync_metadata: { key: string; value: MetadataRecord };
}

export type OfflineDb = IDBPDatabase<OfflineSchema>;
export type UpgradeTx = IDBPTransaction<OfflineSchema, StoreNames<OfflineSchema>[], "versionchange">;

/**
 * Migrations are additive and versioned. A migration must never drop or rewrite
 * pending operations; test with pending ops before shipping a service-worker
 * update that changes the schema (see tests/unit/offline-db.test.ts).
 */
export type Migration = (db: OfflineDb, tx: UpgradeTx) => void;
export const MIGRATIONS: Record<number, Migration> = {
  1: (db) => {
    const drafts = db.createObjectStore("drafts", { keyPath: "id" });
    drafts.createIndex("by_owner", "ownerId");
    const ops = db.createObjectStore("operations", { keyPath: "id" });
    ops.createIndex("by_owner", "ownerId");
    ops.createIndex("by_state", "state");
    const media = db.createObjectStore("local_media", { keyPath: "id" });
    media.createIndex("by_owner", "ownerId");
    media.createIndex("by_operation", "operationId");
    media.createIndex("by_draft", "draftId");
    db.createObjectStore("sync_metadata", { keyPath: "key" });
  },
};

export interface OpenOptions {
  name?: string;
  version?: number;
  migrations?: Record<number, Migration>;
}

export function openOfflineDb({ name = DB_NAME, version = SCHEMA_VERSION, migrations = MIGRATIONS }: OpenOptions = {}): Promise<OfflineDb> {
  return openDB<OfflineSchema>(name, version, {
    upgrade(db, oldVersion, newVersion, tx) {
      for (let v = oldVersion + 1; v <= (newVersion ?? version); v++) {
        migrations[v]?.(db, tx);
      }
    },
    blocked() {
      console.warn("Offline database upgrade is blocked by another open tab; close other tabs.");
    },
  });
}

let shared: Promise<OfflineDb> | null = null;

/** Lazily opened singleton. Browser-only: never call during server rendering. */
export function getOfflineDb(): Promise<OfflineDb> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is not available in this environment"));
  shared ??= openOfflineDb();
  return shared;
}

export function resetOfflineDbForTests(): void {
  shared = null;
}
