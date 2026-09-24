import { describe, expect, it, vi } from "vitest";
import { MIGRATIONS, openOfflineDb, type Migration } from "@/shared/offline";
import { clearCachedPrincipal, readCachedPrincipal, saveCachedPrincipal } from "@/shared/offline/identity-cache";
import { addMedia, cleanupSyncedMedia, discardOperation, getDraft, listDrafts, listOperations, queueDraft, readSnapshot, reopenAsDraft, saveDraft, StorageFullError, updateOperation } from "@/features/field/store";
import { ALICE, BOB, freshDb, photo, queueReport, syntheticPayload } from "../helpers";

describe("persist before confirm", () => {
  it("has the draft readable from a second connection as soon as saveDraft resolves", async () => {
    const name = `persist-${Math.random()}`;
    const db = await openOfflineDb({ name });
    await saveDraft(db, ALICE, "d1", syntheticPayload(), 2);
    db.close();
    const reopened = await openOfflineDb({ name }); // simulates an app restart
    const found = await getDraft(reopened, ALICE.ownerId, "d1");
    expect(found?.payload.description).toContain("SYNTHETIC");
    expect(found?.draft.step).toBe(2);
  });

  it("keeps a queued operation and its photos across a restart", async () => {
    const name = `restart-${Math.random()}`;
    const db = await openOfflineDb({ name });
    const op = await queueReport(db, ALICE, { photos: 2 });
    db.close();
    const reopened = await openOfflineDb({ name });
    const ops = await listOperations(reopened, ALICE.ownerId);
    expect(ops.map((o) => o.id)).toEqual([op.id]);
    expect(ops[0]?.state).toBe("QUEUED");
    expect((await readSnapshot(reopened, ALICE.ownerId)).media.length).toBe(2);
  });

  it("reports a full device instead of pretending it saved", async () => {
    const db = await freshDb();
    const quota = Object.assign(new Error("full"), { name: "QuotaExceededError" });
    const spy = vi.spyOn(db, "put").mockRejectedValueOnce(quota as never);
    await expect(saveDraft(db, ALICE, "d1", syntheticPayload(), 0)).rejects.toBeInstanceOf(StorageFullError);
    spy.mockRestore();
  });
});

describe("queueing", () => {
  it("moves the draft into one QUEUED operation atomically and reuses its id", async () => {
    const db = await freshDb();
    const op = await queueReport(db, ALICE, { id: "op-1", photos: 1 });
    expect(op.id).toBe("op-1");
    expect(op.state).toBe("QUEUED");
    expect(await listDrafts(db, ALICE.ownerId)).toHaveLength(0);
    expect(op.localMediaIds).toHaveLength(1);
  });

  it("refuses to queue another user's draft", async () => {
    const db = await freshDb();
    await saveDraft(db, ALICE, "d1", syntheticPayload(), 4);
    await expect(queueDraft(db, BOB.ownerId, "d1")).rejects.toThrow();
    expect(await getDraft(db, ALICE.ownerId, "d1")).not.toBeNull();
  });
});

describe("two users on one device", () => {
  it("hides each user's drafts, operations and photos from the other", async () => {
    const db = await freshDb();
    await queueReport(db, ALICE, { photos: 1 });
    await saveDraft(db, BOB, "bob-draft", syntheticPayload(), 1);
    const bob = await readSnapshot(db, BOB.ownerId);
    expect(bob.operations).toHaveLength(0);
    expect(bob.media).toHaveLength(0);
    expect(bob.drafts.map((d) => d.draft.id)).toEqual(["bob-draft"]);
    expect(bob.otherAccountPending).toBe(1); // a count only, never contents
    expect(await getDraft(db, BOB.ownerId, "nope")).toBeNull();
  });

  it("cannot discard another user's unsent report", async () => {
    const db = await freshDb();
    const op = await queueReport(db, ALICE);
    await discardOperation(db, BOB.ownerId, op.id);
    expect(await listOperations(db, ALICE.ownerId)).toHaveLength(1);
  });

  it("drops the cached identity on logout so the next person cannot resume it", async () => {
    const db = await freshDb();
    const principal = { user_id: ALICE.ownerId, org_id: ALICE.orgId, display_name: "Test", org_name: "Org", org_kind: "FIELD_AUTHORITY", role: "FIELD_OFFICER", capabilities: [], dev_mode: false };
    await saveCachedPrincipal(principal, db);
    expect((await readCachedPrincipal(db))?.user_id).toBe(ALICE.ownerId);
    await clearCachedPrincipal(db);
    expect(await readCachedPrincipal(db)).toBeNull();
  });
});

describe("cleanup is explicit and safe", () => {
  it("removes only photos of accepted reports and never unsent evidence", async () => {
    const db = await freshDb();
    const sent = await queueReport(db, ALICE, { photos: 1 });
    const unsent = await queueReport(db, ALICE, { photos: 1 });
    await updateOperation(db, ALICE.ownerId, sent.id, { state: "SUBMITTING" });
    await updateOperation(db, ALICE.ownerId, sent.id, { state: "SYNCED", serverResult: { reportId: "r1", reviewState: "SUBMITTED" } });
    const result = await cleanupSyncedMedia(db, ALICE.ownerId);
    expect(result.removed).toBe(1);
    const snap = await readSnapshot(db, ALICE.ownerId);
    expect(snap.media.every((m) => m.operationId === unsent.id)).toBe(true);
    expect(snap.media).toHaveLength(1);
  });

  it("returns an unsent report to an editable draft; a conflict gets a fresh operation id", async () => {
    const db = await freshDb();
    const op = await queueReport(db, ALICE, { photos: 1 });
    await updateOperation(db, ALICE.ownerId, op.id, { state: "SUBMITTING" });
    await updateOperation(db, ALICE.ownerId, op.id, { state: "NEEDS_REVIEW" });
    const newId = await reopenAsDraft(db, ALICE.ownerId, op.id);
    expect(newId).not.toBe(op.id);
    expect(await listOperations(db, ALICE.ownerId)).toHaveLength(0);
    expect((await getDraft(db, ALICE.ownerId, newId as string))?.payload.description).toContain("SYNTHETIC");
  });

  it("rejects illegal state transitions", async () => {
    const db = await freshDb();
    const op = await queueReport(db);
    await expect(updateOperation(db, ALICE.ownerId, op.id, { state: "SYNCED" })).rejects.toThrow(/Illegal/);
  });
});

describe("schema upgrade", () => {
  it("keeps pending operations, photos and drafts when a later migration adds an index", async () => {
    const name = `upgrade-${Math.random()}`;
    const v1 = await openOfflineDb({ name, version: 1 });
    const op = await queueReport(v1, ALICE, { photos: 1 });
    await saveDraft(v1, ALICE, "draft-x", syntheticPayload(), 1);
    await addMedia(v1, ALICE, "draft-x", photo(), "d.jpg");
    v1.close();

    const addIndex: Migration = (_db, tx) => {
      (tx.objectStore("operations") as unknown as { createIndex: (name: string, key: string) => unknown }).createIndex("by_created", "createdAt");
    };
    const v2 = await openOfflineDb({ name, version: 2, migrations: { ...MIGRATIONS, 2: addIndex } });
    expect(v2.objectStoreNames.contains("operations")).toBe(true);
    const ops = await listOperations(v2, ALICE.ownerId);
    expect(ops.map((o) => o.id)).toEqual([op.id]);
    expect(ops[0]?.state).toBe("QUEUED");
    expect((await readSnapshot(v2, ALICE.ownerId)).media).toHaveLength(2);
    expect(await getDraft(v2, ALICE.ownerId, "draft-x")).not.toBeNull();
    const untyped = v2 as unknown as { getAllFromIndex: (store: string, index: string) => Promise<unknown[]> };
    expect(await untyped.getAllFromIndex("operations", "by_created")).toHaveLength(1);
  });
});
