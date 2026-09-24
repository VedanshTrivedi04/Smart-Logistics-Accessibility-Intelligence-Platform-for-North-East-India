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
const VERSION = "v1";
const SHELL_CACHE = `ner-shell-${VERSION}`;
const STATIC_CACHE = `ner-static-${VERSION}`;
const SYNC_TAG = "ner-report-sync";

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
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match(req)) || (await cache.match("/offline")) || new Response("Offline", { status: 503 });
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
