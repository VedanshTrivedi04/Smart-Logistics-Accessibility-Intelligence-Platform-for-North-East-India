import createClient, { type Middleware } from "openapi-fetch";
import { getCsrfToken, clearCsrfToken } from "./csrf";
import { ApiError, fromResponse, networkError } from "./errors";
import type { paths } from "./schema";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Fired when any request comes back 401 so the session layer can move to "expired". */
export const sessionEvents = new EventTarget();
export const SESSION_EXPIRED_EVENT = "session-expired";

const csrfAndAuth: Middleware = {
  async onRequest({ request }) {
    const url = new URL(request.url, "http://localhost");
    // Machine-to-machine telemetry authenticates with a device token, not the session cookie.
    if (UNSAFE_METHODS.has(request.method) && !url.pathname.startsWith("/api/v1/telemetry")) {
      try {
        request.headers.set("X-CSRF-Token", await getCsrfToken());
      } catch {
        // Let the request proceed; the server will answer 401/403 and the caller sees a real error.
      }
    }
    return request;
  },
  onResponse({ response }) {
    if (response.status === 401) sessionEvents.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    return undefined;
  },
};

/**
 * Typed FastAPI client generated from backend/openapi.json (pnpm gen:api).
 * Same-origin: paths already contain /api/v1 and go through the reverse proxy,
 * carrying the HttpOnly session cookie. No tokens are read or stored here.
 */
export const api = createClient<paths>({ baseUrl: "", credentials: "same-origin" });
api.use(csrfAndAuth);

interface Envelope<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * Resolve an openapi-fetch call into its data or throw an ApiError.
 * Retries exactly once when the server reports a stale CSRF token.
 */
export async function unwrap<T>(run: () => Promise<Envelope<T>>): Promise<T> {
  const attempt = async (): Promise<Envelope<T>> => {
    try {
      return await run();
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      throw networkError(cause);
    }
  };

  let result = await attempt();
  if (result.error !== undefined && result.response.status === 403) {
    const err = fromResponse(result.response, result.error);
    if (err.code === "CSRF_VALIDATION_FAILED") {
      clearCsrfToken();
      await getCsrfToken(true).catch(() => undefined);
      result = await attempt();
    }
  }
  if (result.error !== undefined || !result.response.ok) {
    throw fromResponse(result.response, result.error);
  }
  return result.data as T;
}
