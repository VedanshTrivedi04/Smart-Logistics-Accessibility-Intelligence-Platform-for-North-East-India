export type ApiErrorKind =
  | "network"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "stale_version"
  | "stale_route"
  | "validation"
  | "rate_limited"
  | "server"
  | "unknown";

/**
 * Normalised failure from the FastAPI boundary. `kind` lets screens render a
 * different state for "you may not", "not there", "stale" and "service down"
 * instead of a generic error box.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly details: unknown;

  constructor(init: {
    kind: ApiErrorKind;
    status: number;
    code: string;
    message: string;
    requestId?: string | undefined;
    details?: unknown;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.details = init.details;
  }

  /** Transient failures worth retrying automatically. */
  get retryable(): boolean {
    return this.kind === "network" || this.kind === "server" || this.kind === "rate_limited";
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function kindFromStatus(status: number, code: string | undefined): ApiErrorKind {
  if (code === "STALE_VERSION") return "stale_version";
  if (code === "STALE_ROUTE_PLAN") return "stale_route";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 412) return "stale_version";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500) return "server";
  return "unknown";
}

interface BackendErrorBody {
  code?: unknown;
  message?: unknown;
  request_id?: unknown;
  details?: unknown;
  detail?: unknown;
}

function describeFastApiDetail(detail: unknown): string | undefined {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          const loc = Array.isArray((item as { loc?: unknown }).loc)
            ? ((item as { loc: unknown[] }).loc.filter((p) => p !== "body").join(".") || "")
            : "";
          return `${loc ? loc + ": " : ""}${String((item as { msg: unknown }).msg)}`;
        }
        return undefined;
      })
      .filter((s): s is string => Boolean(s));
    if (parts.length) return parts.join("; ");
  }
  return undefined;
}

/** Build an ApiError from a non-2xx response body (backend envelope or FastAPI validation shape). */
export function fromResponse(response: Response, body: unknown): ApiError {
  const b: BackendErrorBody = body && typeof body === "object" ? (body as BackendErrorBody) : {};
  const code = typeof b.code === "string" ? b.code : response.status === 422 ? "VALIDATION_ERROR" : "HTTP_ERROR";
  const message =
    (typeof b.message === "string" && b.message) ||
    describeFastApiDetail(b.detail) ||
    `Request failed (${response.status})`;
  return new ApiError({
    kind: kindFromStatus(response.status, code),
    status: response.status,
    code,
    message,
    requestId: typeof b.request_id === "string" ? b.request_id : response.headers.get("X-Request-ID") ?? undefined,
    details: b.details ?? b.detail,
  });
}

export function networkError(cause: unknown): ApiError {
  return new ApiError({
    kind: "network",
    status: 0,
    code: "NETWORK_UNREACHABLE",
    message: cause instanceof Error && cause.message ? cause.message : "The service could not be reached",
  });
}
