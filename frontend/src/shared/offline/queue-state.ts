/**
 * Offline operation lifecycle (frontend handover): a draft becomes QUEUED, then
 * UPLOADING_MEDIA -> SUBMITTING -> SYNCED, with RETRY_WAIT, NEEDS_LOGIN,
 * NEEDS_REVIEW and FAILED_WITH_REASON branches. DRAFT lives in the drafts store.
 */
export const OP_STATES = [
  "QUEUED",
  "UPLOADING_MEDIA",
  "SUBMITTING",
  "SYNCED",
  "RETRY_WAIT",
  "NEEDS_LOGIN",
  "NEEDS_REVIEW",
  "FAILED_WITH_REASON",
] as const;
export type OpState = (typeof OP_STATES)[number];

const ALLOWED: Record<OpState, readonly OpState[]> = {
  QUEUED: ["UPLOADING_MEDIA", "SUBMITTING", "NEEDS_LOGIN", "FAILED_WITH_REASON"],
  UPLOADING_MEDIA: ["SUBMITTING", "RETRY_WAIT", "NEEDS_LOGIN", "FAILED_WITH_REASON", "QUEUED"],
  SUBMITTING: ["SYNCED", "RETRY_WAIT", "NEEDS_LOGIN", "NEEDS_REVIEW", "FAILED_WITH_REASON", "QUEUED"],
  RETRY_WAIT: ["QUEUED", "UPLOADING_MEDIA", "SUBMITTING", "NEEDS_LOGIN", "FAILED_WITH_REASON"],
  NEEDS_LOGIN: ["QUEUED", "FAILED_WITH_REASON"],
  NEEDS_REVIEW: ["QUEUED", "FAILED_WITH_REASON"],
  FAILED_WITH_REASON: ["QUEUED"],
  SYNCED: [],
};

export function canTransition(from: OpState, to: OpState): boolean {
  return from === to || ALLOWED[from].includes(to);
}

export function assertTransition(from: OpState, to: OpState): void {
  if (!canTransition(from, to)) throw new Error(`Illegal queue transition ${from} -> ${to}`);
}

/** States that the engine may pick up without further user action. */
export function isAutoRetryable(state: OpState): boolean {
  return state === "QUEUED" || state === "UPLOADING_MEDIA" || state === "SUBMITTING" || state === "RETRY_WAIT";
}

export interface BackoffOptions {
  baseMs?: number;
  capMs?: number;
  rng?: () => number;
}

/** Exponential backoff with full jitter: uniform in (0, min(cap, base * 2^attempt)]. */
export function backoffDelayMs(attempt: number, { baseMs = 2_000, capMs = 5 * 60_000, rng = Math.random }: BackoffOptions = {}): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.floor(rng() * ceiling) + 1;
}

export interface FailureInfo {
  state: "RETRY_WAIT" | "NEEDS_LOGIN" | "NEEDS_REVIEW" | "FAILED_WITH_REASON";
  retryable: boolean;
}

/**
 * Map an HTTP outcome (or a per-item batch status) to a queue branch. Transient
 * failures back off; auth failures wait for the same user; conflicts need a
 * person; other client errors are never retried blindly.
 */
export function classifyFailure(status: number, code?: string): FailureInfo {
  if (status === 401) return { state: "NEEDS_LOGIN", retryable: false };
  if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) {
    return { state: "RETRY_WAIT", retryable: true };
  }
  if (status === 409 || code === "IDEMPOTENCY_CONFLICT") return { state: "NEEDS_REVIEW", retryable: false };
  return { state: "FAILED_WITH_REASON", retryable: false };
}

export const STATE_LABEL: Record<OpState, string> = {
  QUEUED: "Saved on device — waiting to send",
  UPLOADING_MEDIA: "Uploading photos",
  SUBMITTING: "Sending to server",
  SYNCED: "Accepted by server",
  RETRY_WAIT: "Will retry",
  NEEDS_LOGIN: "Sign in to continue",
  NEEDS_REVIEW: "Needs your review",
  FAILED_WITH_REASON: "Rejected — will not retry",
};

export const STATE_REMEDY: Record<OpState, string> = {
  QUEUED: "Waiting to send. It goes automatically when the service is reachable, or press Sync now.",
  UPLOADING_MEDIA: "Uploading photos. Keep the app open; it resumes if interrupted.",
  SUBMITTING: "Sending the report to the server.",
  SYNCED: "The server accepted this report.",
  RETRY_WAIT: "A temporary problem occurred. It retries automatically after a delay, or press Sync now.",
  NEEDS_LOGIN: "Your session ended. Sign in again as the same user; nothing was lost.",
  NEEDS_REVIEW: "The server reports a conflict with an earlier submission. Review the report, then re-queue it as a new report or discard it.",
  FAILED_WITH_REASON: "The server rejected this report and it will not be retried automatically. Edit it to fix the problem, or discard it.",
};
