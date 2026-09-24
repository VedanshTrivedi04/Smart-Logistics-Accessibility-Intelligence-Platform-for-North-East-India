import { beforeEach, describe, expect, it } from "vitest";
import { getOperation, listOperations, listMedia } from "@/features/field/store";
import { runSync } from "@/features/field/sync/engine";
import { TransportError } from "@/features/field/sync/transport";
import { ALICE, BOB, fakeServer, freshDb, netError, queueReport, sha } from "../helpers";
import type { OfflineDb } from "@/shared/offline";

let db: OfflineDb;
let server: ReturnType<typeof fakeServer>;
const T0 = new Date("2026-01-01T06:00:00Z");

const run = (over: Partial<Parameters<typeof runSync>[0]> = {}) =>
  runSync({ db, ownerId: ALICE.ownerId, transport: server.transport, now: () => T0, rng: () => 0.5, sha256: sha, ...over });

beforeEach(async () => {
  db = await freshDb();
  server = fakeServer();
});

describe("happy path", () => {
  it("sends a text-only report and records the server's per-item result", async () => {
    const op = await queueReport(db);
    const summary = await run();
    expect(summary.synced).toBe(1);
    const after = await getOperation(db, ALICE.ownerId, op.id);
    expect(after?.state).toBe("SYNCED");
    expect(after?.serverResult?.reviewState).toBe("SUBMITTED");
    expect(server.calls.items[0]).toEqual([op.id]);
  });

  it("uploads photos first and attaches only confirmed media ids", async () => {
    const op = await queueReport(db, ALICE, { photos: 2 });
    await run();
    expect(server.calls.put).toBe(2);
    expect(server.calls.confirm).toBe(2);
    const stored = server.reports.get(op.id);
    expect((stored?.item["media_ids"] as string[]).length).toBe(2);
    expect((await getOperation(db, ALICE.ownerId, op.id))?.state).toBe("SYNCED");
  });
});

describe("exactly-once under retries", () => {
  it("keeps one server report when the response is lost after commit and the client retries", async () => {
    const op = await queueReport(db);
    server.behaviour.loseResponseAfterCommit = true;
    const first = await run();
    expect(first.retryWait).toBe(1);
    expect((await getOperation(db, ALICE.ownerId, op.id))?.state).toBe("RETRY_WAIT");
    expect(server.reports.size).toBe(1); // committed even though the client never heard back

    const second = await run({ force: true });
    expect(second.synced).toBe(1);
    expect(server.reports.size).toBe(1);
    // the operation id never changed between attempts
    expect(server.calls.items).toEqual([[op.id], [op.id]]);
  });
});

describe("interrupted photo upload", () => {
  it("keeps the report, resumes, and does not re-upload confirmed photos", async () => {
    const op = await queueReport(db, ALICE, { photos: 2 });
    let puts = 0;
    server.behaviour.put = () => (++puts === 2 ? netError() : null);
    const first = await run();
    expect(first.retryWait).toBe(1);
    const mid = await getOperation(db, ALICE.ownerId, op.id);
    expect(mid?.state).toBe("RETRY_WAIT");
    const media = await listMedia(db, ALICE.ownerId, { operationId: op.id });
    expect(media.filter((m) => m.serverMediaId).length).toBe(1);

    server.behaviour.put = null;
    const second = await run({ force: true });
    expect(second.synced).toBe(1);
    expect(server.calls.put).toBe(3); // 2 in the first pass (one failed) + 1 remaining, not 4
  });

  it("lets the officer send a text-only report when photos cannot upload", async () => {
    const op = await queueReport(db, ALICE, { photos: 1 });
    server.behaviour.put = () => netError();
    await run();
    const { updateOperation } = await import("@/features/field/store");
    await updateOperation(db, ALICE.ownerId, op.id, { textOnly: true, state: "QUEUED", attempts: 0, lastError: null, nextAttemptAt: null });
    const summary = await run();
    expect(summary.synced).toBe(1);
    expect(server.reports.get(op.id)?.item["media_ids"]).toEqual([]);
  });
});

describe("authentication", () => {
  it("preserves the report when the session expired and resumes for the same user", async () => {
    const op = await queueReport(db);
    server.behaviour.batchError = () => new TransportError(401, "expired");
    const first = await run();
    expect(first.needsLogin).toBe(1);
    const parked = await getOperation(db, ALICE.ownerId, op.id);
    expect(parked?.state).toBe("NEEDS_LOGIN");
    expect(parked?.payload).toBeTruthy();

    server.behaviour.batchError = null;
    const second = await run(); // signed back in as the same user
    expect(second.synced).toBe(1);
  });

  it("never touches another account's queue on a shared device", async () => {
    const mine = await queueReport(db, ALICE);
    const theirs = await queueReport(db, BOB);
    await run();
    expect((await getOperation(db, ALICE.ownerId, mine.id))?.state).toBe("SYNCED");
    expect((await db.get("operations", theirs.id))?.state).toBe("QUEUED");
    expect(await getOperation(db, ALICE.ownerId, theirs.id)).toBeNull();
    expect(server.reports.has(theirs.id)).toBe(false);
  });
});

describe("failure classification", () => {
  it("does not retry a forbidden or invalid report automatically", async () => {
    const op = await queueReport(db);
    server.behaviour.itemFailures.set(op.id, { status_code: 403, error_code: "FORBIDDEN", message: "no" });
    const first = await run();
    expect(first.failed).toBe(1);
    const second = await run(); // not forced
    expect(second.attempted).toBe(0);
    expect((await getOperation(db, ALICE.ownerId, op.id))?.state).toBe("FAILED_WITH_REASON");
  });

  it("sends a conflict to review instead of retrying", async () => {
    const op = await queueReport(db);
    server.behaviour.itemFailures.set(op.id, { status_code: 409, error_code: "IDEMPOTENCY_CONFLICT" });
    await run();
    expect((await getOperation(db, ALICE.ownerId, op.id))?.state).toBe("NEEDS_REVIEW");
  });

  it("decides success per item, not from the overall response", async () => {
    const a = await queueReport(db, ALICE, { id: "00000000-0000-4000-8000-00000000000a" });
    const b = await queueReport(db, ALICE, { id: "00000000-0000-4000-8000-00000000000b" });
    const c = await queueReport(db, ALICE, { id: "00000000-0000-4000-8000-00000000000c" });
    server.behaviour.itemFailures.set(b.id, { status_code: 422, error_code: "VALIDATION_ERROR" });
    server.behaviour.omit.add(c.id); // the server said nothing about this one
    const summary = await run();
    expect(summary.synced).toBe(1);
    expect((await getOperation(db, ALICE.ownerId, a.id))?.state).toBe("SYNCED");
    expect((await getOperation(db, ALICE.ownerId, b.id))?.state).toBe("FAILED_WITH_REASON");
    expect((await getOperation(db, ALICE.ownerId, c.id))?.state).toBe("RETRY_WAIT"); // never guessed as success
  });

  it("treats a scan-pending photo as retryable, then asks the officer", async () => {
    const op = await queueReport(db, ALICE, { photos: 1 });
    server.behaviour.itemFailures.set(op.id, { status_code: 422, error_code: "MEDIA_SCAN_PENDING_OR_REJECTED" });
    await run();
    expect((await getOperation(db, ALICE.ownerId, op.id))?.state).toBe("RETRY_WAIT");
    for (let i = 0; i < 3; i++) await run({ force: true });
    expect((await getOperation(db, ALICE.ownerId, op.id))?.state).toBe("NEEDS_REVIEW");
  });
});

describe("backoff", () => {
  it("waits for the retry time unless the officer presses Sync now", async () => {
    const op = await queueReport(db);
    server.behaviour.batchError = () => new TransportError(503, "busy");
    await run();
    const parked = await getOperation(db, ALICE.ownerId, op.id);
    expect(parked?.state).toBe("RETRY_WAIT");
    expect(new Date(parked?.nextAttemptAt ?? 0).getTime()).toBeGreaterThan(T0.getTime());

    server.behaviour.batchError = null;
    expect((await run()).attempted).toBe(0); // too early
    expect((await run({ force: true })).synced).toBe(1);
  });

  it("retries automatically once the retry time has passed", async () => {
    const op = await queueReport(db);
    server.behaviour.batchError = () => new TransportError(0, "offline");
    await run();
    server.behaviour.batchError = null;
    const later = new Date(T0.getTime() + 10 * 60_000);
    const summary = await run({ now: () => later });
    expect(summary.synced).toBe(1);
    expect((await listOperations(db, ALICE.ownerId)).find((o) => o.id === op.id)?.state).toBe("SYNCED");
  });
});
