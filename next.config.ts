import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin module resolution to this repository. This avoids Turbopack choosing
  // `src/app` (or a parent lockfile) as the workspace root when an IDE starts
  // Next.js with a non-standard working directory.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
