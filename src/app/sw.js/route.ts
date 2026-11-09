import { NextResponse } from "next/server";

// /sw.js is a route (not a static file) so development can serve a "kill switch" worker instead.
// If a production build ever ran on this same address (e.g. localhost:3000), the browser keeps that
// worker; the kill switch replaces it, deletes its caches, unregisters itself and reloads the page, so
// `next dev` never shows stale styles or scripts.
export const dynamic = "force-dynamic";

const PRODUCTION_WORKER = `
/* Never store resident data, API responses, authenticated pages or app HTML. */
const CACHE = "sjr-public-offline-v2";
const OFFLINE = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([
    OFFLINE, "/icons/icon-192.png", "/icons/icon-512.png",
    "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png",
  ])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("sjr-") && key !== CACHE)
      .map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // All API, admin, and framework requests pass straight through to the network.
  if (event.request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(fetch(event.request).catch(() =>
      caches.match(OFFLINE).then((page) => page || Response.error()),
    ));
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
