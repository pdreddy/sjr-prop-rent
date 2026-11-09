"use client";

import { useEffect, useState } from "react";

export function PwaRegister() {
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) => registration.unregister()),
          ),
        )
        .catch(() => undefined);
      if ("caches" in window)
        void caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith("sjr-"))
                .map((key) => caches.delete(key)),
            ),
          )
          .catch(() => undefined);
      return;
    }
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let wasControlled = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => {
      if (wasControlled && !disposed) setUpdated(true);
      wasControlled = true;
    };
    const checkForUpdate = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void registration?.update().catch(() => undefined);
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((value) => {
        if (!disposed) registration = value;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("online", checkForUpdate);
    };
  }, []);
  if (!updated) return null;
  return (
    <div className="app-update-notice" role="status">
      <span>A new app version is ready.</span>
      <button onClick={() => window.location.reload()}>Refresh app</button>
      <button
        className="dismiss-update"
        aria-label="Dismiss app update"
        onClick={() => setUpdated(false)}
      >
        ×
      </button>
    </div>
  );
}
