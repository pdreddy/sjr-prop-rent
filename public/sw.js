/* This app does not use offline caching. This no-op worker replaces and removes
 * service workers left behind by older localhost/deployment versions. */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      self.registration.unregister(),
      caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))),
    ])
  );
});
