/* Only an informational offline page and app icons are stored on device.
   Resident data, API responses and authenticated pages always use the network. */
const CACHE = "sjr-public-offline-v1";
const OFFLINE = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          OFFLINE,
          "/icons/icon-192.png",
          "/icons/icon-512.png",
          "/icons/icon-maskable-512.png",
          "/icons/apple-touch-icon.png",
        ]),
      ),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("sjr-public-offline-") && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  // Never intercept API, admin, or Next.js data requests.
  if (event.request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE).then((page) => page || Response.error()),
      ),
    );
  }
});
