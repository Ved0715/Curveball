import type { NextConfig } from "next";

// The browser talks to FastAPI through this app (same origin), so the session cookie is
// first-party and there's no CORS in the hot path. BACKEND_URL is server-side only.
const backend = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Pin the project root (there's an unrelated lockfile higher up the tree).
  turbopack: { root: __dirname },
  // The dev-only badge sits over the mobile tab bar.
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
