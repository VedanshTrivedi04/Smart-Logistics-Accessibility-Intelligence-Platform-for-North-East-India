import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a real FastAPI + PostGIS test stack seeded with the labelled
 * synthetic demo dataset (backend/app/scripts/seed_demo.py). They never target production:
 * the base URL must be local or explicitly allow-listed, and the run aborts otherwise.
 *
 *   E2E_BASE_URL     default http://localhost:3100 (started here from a production build)
 *   E2E_ALLOW_HOSTS  comma-separated extra hostnames that are safe test servers
 *   BACKEND_ORIGIN   FastAPI origin the started Next server proxies to (default http://localhost:8000)
 *
 * The backend must run with DEV_JWT_MODE=true and be seeded; see frontend/README.md.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const host = new URL(baseURL).hostname;
const allowed = new Set(["localhost", "127.0.0.1", ...(process.env.E2E_ALLOW_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean)]);
if (!allowed.has(host)) {
  throw new Error(`Refusing to run e2e tests against ${host}. Only local or E2E_ALLOW_HOSTS test servers are allowed; never production.`);
}

const managed = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", serviceWorkers: "allow" },
  projects: [
    // Target devices/browsers actually exercised: a Chromium desktop and a mid-range Android-class phone profile.
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
  webServer: managed
    ? {
        // A production build is required: the offline service worker is registered only in production.
        command: "pnpm build && pnpm start -p 3100",
        url: "http://localhost:3100/login",
        reuseExistingServer: true,
        timeout: 300_000,
        env: { NEXT_PUBLIC_DEV_LOGIN: "1", BACKEND_ORIGIN: process.env.BACKEND_ORIGIN ?? "http://localhost:8000" },
      }
    : undefined,
});
