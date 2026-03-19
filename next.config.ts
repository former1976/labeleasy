import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin root to this project's directory to avoid lockfile detection conflicts
    root: __dirname,
  },
};

export default nextConfig;
