"use client";

import { useEffect } from "react";

// Production: register the service worker. Development: remove any worker (and its caches) left over
// from an earlier production build on the same address, so it can never serve stale files to `next dev`.
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => undefined);
      if ("caches" in window)
        caches
          .keys()
          .then((keys) =>
            keys
              .filter((k) => k.startsWith("sjr-"))
              .forEach((k) => caches.delete(k)),
          )
          .catch(() => undefined);
      return;
    }
    const register = () =>
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
