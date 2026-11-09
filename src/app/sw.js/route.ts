import { NextResponse } from "next/server";

// /sw.js is a route (not a static file) so development can serve a "kill switch" worker instead.
// If a production build ever ran on this same address (e.g. localhost:3000), the browser keeps that
// worker; the kill switch replaces it, deletes its caches, unregisters itself and reloads the page, so
// `next dev` never shows stale styles or scripts.
export const dynamic = "force-dynamic";

const PRODUCTION_WORKER = `/* SJR Rent Tracker service worker.
 * - Makes the app installable and gives a friendly offline page.
 * - Caches ONLY public static files (build assets, icons, offline page) as an offline fallback.
 * - Never caches /api/* or any HTML page, so rent data and admin screens are not stored on the device.
 * Bump VERSION to force clients to drop old caches. */
const VERSION = "v2";
const STATIC_CACHE = \`sjr-static-\${VERSION}\`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sjr-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always live, never cached

  // Page loads: network only; show the offline page if the network is down.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Build assets and icons: network first (always fresh), falling back to the cache only when offline.
  // Never cache-first: a stale cached stylesheet or script would hide every later deploy or code change.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
`;

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
  const body = process.env.NODE_ENV === "production" ? PRODUCTION_WORKER : KILL_SWITCH;
  return new NextResponse(body, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate", "Service-Worker-Allowed": "/" },
  });
}
