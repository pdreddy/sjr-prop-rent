import { NextResponse } from "next/server";

// /sw.js is a route (not a static file) so development can serve a "kill switch" worker instead.
// If a production build ever ran on this same address (e.g. localhost:3000), the browser keeps that
// worker; the kill switch replaces it, deletes its caches, unregisters itself and reloads the page, so
// `next dev` never shows stale styles or scripts.
export const dynamic = "force-dynamic";

const PRODUCTION_WORKER =
  '/* Only an informational offline page and app icons are stored on device.\n   Resident data, API responses and authenticated pages always use the network. */\nconst CACHE = "sjr-public-offline-v1";\nconst OFFLINE = "/offline.html";\nself.addEventListener("install", (event) => {\n  event.waitUntil(\n    caches\n      .open(CACHE)\n      .then((cache) =>\n        cache.addAll([\n          OFFLINE,\n          "/icons/icon-192.png",\n          "/icons/icon-512.png",\n          "/icons/icon-maskable-512.png",\n          "/icons/apple-touch-icon.png",\n        ]),\n      ),\n  );\n});\nself.addEventListener("activate", (event) => {\n  event.waitUntil(\n    caches\n      .keys()\n      .then((keys) =>\n        Promise.all(\n          keys\n            .filter(\n              (key) => key.startsWith("sjr-public-offline-") && key !== CACHE,\n            )\n            .map((key) => caches.delete(key)),\n        ),\n      )\n      .then(() => self.clients.claim()),\n  );\n});\nself.addEventListener("fetch", (event) => {\n  const url = new URL(event.request.url);\n  if (event.request.method !== "GET" || url.origin !== self.location.origin)\n    return;\n  // Never intercept API, admin, or Next.js data requests.\n  if (event.request.mode === "navigate" && url.pathname === "/") {\n    event.respondWith(\n      fetch(event.request).catch(() =>\n        caches.match(OFFLINE).then((page) => page || Response.error()),\n      ),\n    );\n  }\n});\n';

const KILL_SWITCH = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("sjr-")).map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) => client.navigate(client.url));
  })());
});
`;

export function GET() {
  const body =
    process.env.NODE_ENV === "production" ? PRODUCTION_WORKER : KILL_SWITCH;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
