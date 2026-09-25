/*
 * Offline shell worker.
 *
 * Scope of responsibility: let the field pages open without a network so an officer can reach
 * the report form and the send queue. It NEVER caches or serves /api or /health responses:
 * protected data is not stored by the worker. Report data lives in IndexedDB, owned by the app.
 *
 * Update policy: bump VERSION with any change. A new worker takes over only after all tabs using
 * the old one are closed (no skipWaiting), so an open form is never swapped mid-entry. Schema
 * changes to IndexedDB must ship with a tested migration (see tests/unit/offline-db.test.ts).
 */
const VERSION = "v3";
const SHELL_CACHE = `ner-shell-${VERSION}`;
const STATIC_CACHE = `ner-static-${VERSION}`;
const SYNC_TAG = "ner-report-sync";

// Field screens that must open with no connection. The app asks the worker to fetch these right after a
// verified sign-in ("warm-field-shell"), so they work even if the officer never visited them online first.
// Written after every field screen and its assets were saved; the app reads it to show "ready for offline use".
const READY_KEY = "/__field-shell-ready";
const FIELD_ROUTES = ["/field", "/field/report/new", "/field/road-update", "/field/queue", "/field/nearby", "/field/reports", "/field/profile"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add("/offline")));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== SHELL_CACHE && key !== STATIC_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

function isProtectedApi(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/health");
}

function isFieldNavigation(url) {
  return url.pathname === "/field" || url.pathname.startsWith("/field/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || isProtectedApi(url)) return;
  // React Server Component payloads are not documents; leave them to the network.
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && isFieldNavigation(url) && !res.redirected) {
            const cache = await caches.open(SHELL_CACHE);
            // Keyed by path only: /field/report/new?type=FLOODING and ?draft=... share one cached shell.
            cache.put(url.pathname, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(url.pathname)) ||
            (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match("/offline")) ||
            new Response("Offline", { status: 503 })
          );
        }
      })(),
    );
  }
});

// Optional Background Sync: only a nudge. The page decides what to send, using real request outcomes.
self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((clients) => {
      for (const c of clients) c.postMessage({ type: "ner-sync" });
    }),
  );
});

// Fetch the field screens and the scripts/styles they need while there is a connection.
async function warmFieldShell() {
  const shell = await caches.open(SHELL_CACHE);
  const assets = await caches.open(STATIC_CACHE);
  let saved = 0;
  for (const path of FIELD_ROUTES) {
    try {
      const res = await fetch(path, { credentials: "same-origin" });
      // A redirect means "not signed in": caching the login page under a field path would be wrong.
      if (!res.ok || res.redirected) continue;
      await shell.put(path, res.clone());
      saved += 1;
      const html = await res.text();
      // Asset paths end at a quote, whitespace, angle bracket or backslash. They may contain parentheses:
      // Next names route-group chunks like /_next/static/chunks/app/(protected)/field/queue/page-....js.
      const urls = new Set(html.match(/\/_next\/static\/[^"'\s<>\\]+/g) || []);
      for (const asset of urls) {
        if (await assets.match(asset)) continue;
        try {
          const r = await fetch(asset);
          if (r.ok) await assets.put(asset, r);
        } catch {
          /* fetched on demand later */
        }
      }
    } catch {
      /* offline or blocked right now: it is tried again on the next sign-in or reconnect */
    }
  }
  if (saved === FIELD_ROUTES.length) await shell.put(READY_KEY, new Response(String(Date.now())));
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "warm-field-shell") event.waitUntil(warmFieldShell());
});
