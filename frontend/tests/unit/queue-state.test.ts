import { describe, expect, it } from "vitest";
import { OP_STATES, assertTransition, backoffDelayMs, canTransition, classifyFailure, isAutoRetryable, levelFor } from "@/shared/offline";

describe("queue state machine", () => {
  it("follows the documented happy path", () => {
    expect(canTransition("QUEUED", "UPLOADING_MEDIA")).toBe(true);
    expect(canTransition("UPLOADING_MEDIA", "SUBMITTING")).toBe(true);
    expect(canTransition("SUBMITTING", "SYNCED")).toBe(true);
  });

  it("cannot skip straight to SYNCED or leave SYNCED", () => {
    expect(canTransition("QUEUED", "SYNCED")).toBe(false);
    for (const s of OP_STATES) if (s !== "SYNCED") expect(canTransition("SYNCED", s)).toBe(false);
    expect(() => assertTransition("SYNCED", "QUEUED")).toThrow();
  });

  it("only auto-retries states that need no person", () => {
    expect(isAutoRetryable("RETRY_WAIT")).toBe(true);
    for (const s of ["NEEDS_LOGIN", "NEEDS_REVIEW", "FAILED_WITH_REASON", "SYNCED"] as const) expect(isAutoRetryable(s)).toBe(false);
  });
});

describe("failure classification", () => {
  it.each([
    [401, "NEEDS_LOGIN"],
    [403, "FAILED_WITH_REASON"],
    [404, "FAILED_WITH_REASON"],
    [422, "FAILED_WITH_REASON"],
    [409, "NEEDS_REVIEW"],
    [429, "RETRY_WAIT"],
    [500, "RETRY_WAIT"],
    [503, "RETRY_WAIT"],
    [0, "RETRY_WAIT"],
  ])("maps HTTP %s to %s", (status, state) => {
    expect(classifyFailure(status).state).toBe(state);
  });

  it("treats an idempotency conflict as needing review whatever the status", () => {
    expect(classifyFailure(400, "IDEMPOTENCY_CONFLICT").state).toBe("NEEDS_REVIEW");
  });
});

describe("backoff with jitter", () => {
  it("stays within (0, ceiling] and grows exponentially up to the cap", () => {
    const max = (attempt: number) => backoffDelayMs(attempt, { baseMs: 1000, capMs: 60_000, rng: () => 0.999999 });
    const min = (attempt: number) => backoffDelayMs(attempt, { baseMs: 1000, capMs: 60_000, rng: () => 0 });
    expect(min(3)).toBe(1);
    expect(max(0)).toBeLessThanOrEqual(1000);
    expect(max(3)).toBeLessThanOrEqual(8000);
    expect(max(3)).toBeGreaterThan(max(1));
    expect(max(20)).toBeLessThanOrEqual(60_000);
  });

  it("spreads retries: different random draws give different delays", () => {
    const a = backoffDelayMs(4, { rng: () => 0.1 });
    const b = backoffDelayMs(4, { rng: () => 0.9 });
    expect(a).not.toBe(b);
  });
});

describe("storage warnings", () => {
  it("escalates at 80% and 95%", () => {
    expect(levelFor(0.5)).toBe("ok");
    expect(levelFor(0.8)).toBe("warning");
    expect(levelFor(0.95)).toBe("critical");
  });
});
