import type { NextConfig } from "next";

// The browser only ever talks to same-origin /api/v1. In development Next proxies
// it to FastAPI; in deployment the reverse proxy owns this route instead.
const backend = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

const config: NextConfig = {
  // A separate output folder lets an end-to-end build run without touching a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` },
      { source: "/health/:path*", destination: `${backend}/health/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(self)" },
        ],
      },
    ];
  },
};

export default config;
