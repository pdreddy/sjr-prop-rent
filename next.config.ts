import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin module resolution to this repository. This avoids Turbopack choosing
  // `src/app` (or a parent lockfile) as the workspace root when an IDE starts
  // Next.js with a non-standard working directory.
  // Lets you open the dev server from another device on your network (e.g. a phone at
  // http://192.168.1.231:3000). Dev only; add your machine's LAN IP or set DEV_ORIGINS=ip1,ip2.
  allowedDevOrigins: ["192.168.1.231", ...(process.env.DEV_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [])],
  // Which build is running, shown in admin Settings (Netlify sets BRANCH and COMMIT_REF while building).
  env: {
    NEXT_PUBLIC_BUILD_BRANCH: process.env.BRANCH ?? "",
    NEXT_PUBLIC_BUILD_COMMIT: (process.env.COMMIT_REF ?? "").slice(0, 7),
  },
  async headers() {
    return [
      // The service worker must always be fetched fresh so updates reach installed apps.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }] },
    ];
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
