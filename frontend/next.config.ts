import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root (there's an unrelated lockfile higher up the tree).
  turbopack: { root: __dirname },
};

export default nextConfig;
