import { Blob as NodeBlob } from "node:buffer";
import { openOfflineDb, type OfflineDb } from "@/shared/offline";
import { emptyPayload, type ReportPayload } from "@/features/field/model";
import { saveDraft, addMedia, queueDraft } from "@/features/field/store";
import { TransportError, type SyncTransport } from "@/features/field/sync/transport";

let counter = 0;

/** Every test gets its own IndexedDB so tests cannot leak state into each other. */
export async function freshDb(): Promise<OfflineDb> {
  counter += 1;
  return openOfflineDb({ name: `test-db-${counter}-${Math.random().toString(36).slice(2)}` });
}

export const ALICE = { ownerId: "user-alice", orgId: "org-field" };
export const BOB = { ownerId: "user-bob", orgId: "org-field" };

/** Labelled synthetic observation: coordinates are invented test values, not a real location. */
export function syntheticPayload(overrides: Partial<ReportPayload> = {}): ReportPayload {
  return {
    ...emptyPayload(new Date("2026-01-01T06:00:00Z")),
    reportType: "LANDSLIDE",
    severity: "HIGH",
    description: "SYNTHETIC TEST: debris across one lane",
    location: { latitude: 26.1, longitude: 91.7, accuracy_m: 20, location_provider: "GPS_HARDWARE" },
    ...overrides,
  };
}

export function photo(bytes = 16): Blob {
  return new NodeBlob([new Uint8Array(bytes)], { type: "image/jpeg" }) as unknown as Blob;
}

export async function queueReport(db: OfflineDb, who = ALICE, opts: { id?: string; photos?: number; payload?: Partial<ReportPayload> } = {}) {
  const id = opts.id ?? crypto.randomUUID();
  await saveDraft(db, who, id, syntheticPayload(opts.payload), 4);
  for (let i = 0; i < (opts.photos ?? 0); i++) await addMedia(db, who, id, photo(), `p${i}.jpg`);
  return queueDraft(db, who.ownerId, id);
}

/**
 * In-memory stand-in for the FastAPI reports endpoints. It deduplicates on client_operation_id
 * exactly as the backend contract promises, so "exactly once" can be asserted end to end.
 */
export function fakeServer() {
  const reports = new Map<string, { reportId: string; item: Record<string, unknown> }>();
  const uploads: string[] = [];
  const confirmed = new Set<string>();
  const behaviour = {
    ticket: null as null | (() => Error | null),
    put: null as null | (() => Error | null),
    confirm: null as null | (() => Error | null),
    /** Throw after committing, simulating a response lost on the way back. */
    loseResponseAfterCommit: false,
    batchError: null as null | (() => Error | null),
    itemFailures: new Map<string, { status_code: number; error_code?: string; message?: string }>(),
    omit: new Set<string>(),
  };
  const calls = { batch: 0, ticket: 0, put: 0, confirm: 0, items: [] as string[][] };

  const transport: SyncTransport = {
    async requestUploadTicket() {
      calls.ticket++;
      const e = behaviour.ticket?.();
      if (e) throw e;
      const mediaId = crypto.randomUUID();
      uploads.push(mediaId);
      return { mediaId, uploadUrl: `https://storage.invalid/${mediaId}`, method: "PUT", headers: {}, fields: {} };
    },
    async putObject() {
      calls.put++;
      const e = behaviour.put?.();
      if (e) throw e;
    },
    async confirmUpload(mediaId) {
      calls.confirm++;
      const e = behaviour.confirm?.();
      if (e) throw e;
      confirmed.add(mediaId);
    },
    async syncBatch(items) {
      calls.batch++;
      calls.items.push(items.map((i) => String(i["client_operation_id"])));
      const e = behaviour.batchError?.();
      if (e) throw e;
      const succeeded: object[] = [];
      const failed: object[] = [];
      for (const item of items) {
        const id = String(item["client_operation_id"]);
        if (behaviour.omit.has(id)) continue;
        const bad = behaviour.itemFailures.get(id);
        if (bad) {
          failed.push({ client_operation_id: id, status: "FAILED", ...bad });
          continue;
        }
        const mediaIds = (item["media_ids"] as string[]) ?? [];
        if (mediaIds.some((m) => !confirmed.has(m))) {
          failed.push({ client_operation_id: id, status: "FAILED", status_code: 422, error_code: "MEDIA_NOT_FOUND", message: "unconfirmed media attached" });
          continue;
        }
        let rec = reports.get(id);
        if (!rec) {
          rec = { reportId: crypto.randomUUID(), item };
          reports.set(id, rec);
        }
        succeeded.push({ client_operation_id: id, status: "SUCCESS", report_id: rec.reportId, review_state: "SUBMITTED", is_provisional_caution: false });
      }
      if (behaviour.loseResponseAfterCommit) {
        behaviour.loseResponseAfterCommit = false;
        throw new TransportError(0, "connection reset");
      }
      return { total_submitted: items.length, succeeded_count: succeeded.length, failed_count: failed.length, succeeded: succeeded as never[], failed: failed as never[] };
    },
  };
  return { transport, reports, behaviour, calls, uploads, confirmed };
}

export const sha = async () => "0".repeat(64);
export const netError = () => new TransportError(0, "network down");
