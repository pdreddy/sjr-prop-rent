import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin module resolution to this repository. This avoids Turbopack choosing
  // `src/app` (or a parent lockfile) as the workspace root when an IDE starts
  // Next.js with a non-standard working directory.
  // Lets you open the dev server from another device on your network (e.g. a phone at
  // http://192.168.1.231:3000). Dev only; add your machine's LAN IP or set DEV_ORIGINS=ip1,ip2.
  allowedDevOrigins: ["192.168.1.231", ...(process.env.DEV_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [])],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
