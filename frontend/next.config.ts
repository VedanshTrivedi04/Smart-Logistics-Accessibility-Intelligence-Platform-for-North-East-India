import type { NextConfig } from "next";

// The browser only ever talks to same-origin /api/v1. In development Next proxies
// it to FastAPI; in deployment the reverse proxy owns this route instead.
const backend = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";

const config: NextConfig = {
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
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(self)" },
        ],
      },
    ];
  },
};

export default config;
