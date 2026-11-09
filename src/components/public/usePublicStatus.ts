"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicStatusResponse } from "@/lib/types";

/** Refresh public reads only; Firebase configuration and writes stay on the server. */
export function usePublicStatus(month: string) {
  const [snapshot, setSnapshot] = useState<{
    month: string;
    data: PublicStatusResponse;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let firstLoad = true;
    let inFlight = false;
    let lastStarted = 0;
    let controller: AbortController | null = null;
    async function load(force = false) {
      if (disposed || inFlight || document.visibilityState === "hidden") return;
      if (!navigator.onLine) {
        setOnline(false);
        setLoading(false);
        return;
      }
      if (!force && Date.now() - lastStarted < 1000) return;
      lastStarted = Date.now();
      inFlight = true;
      const request = new AbortController();
      controller = request;
      setOnline(true);
      setError(null);
      if (firstLoad) setLoading(true);
      else setRefreshing(true);
      try {
        const response = await fetch(
          `/api/public/status?month=${encodeURIComponent(month)}`,
          { cache: "no-store", signal: request.signal },
        );
        if (!response.ok) throw new Error("Could not load status");
        const data: PublicStatusResponse = await response.json();
        if (!Array.isArray(data?.plots)) throw new Error("Unexpected response");
        if (disposed || request.signal.aborted) return;
        firstLoad = false;
        setSnapshot({ month, data });
        setUpdatedAt(
          new Date().toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
        );
      } catch {
        if (!disposed && !request.signal.aborted)
          setError("Could not fetch the latest status. Please try again.");
      } finally {
        inFlight = false;
        if (!disposed) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    const refresh = () => {
      void load(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onOnline = () => {
      setOnline(true);
      window.setTimeout(() => {
        void load(true);
      }, 0);
    };
    const onOffline = () => {
      setOnline(false);
      controller?.abort();
      setLoading(false);
      setRefreshing(false);
    };
    refreshRef.current = refresh;
    void load(true);
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      refreshRef.current = () => {};
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [month]);

  const refresh = useCallback(() => refreshRef.current(), []);
  return {
    data: snapshot?.month === month ? snapshot.data : null,
    loading,
    refreshing,
    error,
    online,
    updatedAt,
    refresh,
  };
}
