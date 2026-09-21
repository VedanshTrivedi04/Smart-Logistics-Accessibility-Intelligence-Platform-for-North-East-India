"use client";

import { useEffect } from "react";

/**
 * Registers the offline shell worker in production builds only (a worker under `next dev`
 * serves stale code). The worker never touches /api, so it cannot serve cached protected data.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => void reg.update())
      .catch(() => undefined);
  }, []);
  return null;
}
