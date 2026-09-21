/**
 * CSRF token for unsafe methods. Held in module memory only: it is session-bound,
 * rotated by the server, and must never be persisted to web storage.
 */
let token: string | null = null;
let inflight: Promise<string> | null = null;

export function setCsrfToken(value: string | null): void {
  token = value;
}

export function clearCsrfToken(): void {
  token = null;
  inflight = null;
}

export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (token && !forceRefresh) return token;
  if (!inflight) {
    inflight = fetch("/api/v1/auth/csrf-token", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`csrf-token ${res.status}`);
        const body = (await res.json()) as { csrf_token?: string };
        if (!body.csrf_token) throw new Error("csrf-token missing in response");
        token = body.csrf_token;
        return token;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
