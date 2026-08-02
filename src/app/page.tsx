"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import { getCurrentMonth, getMonthOptions } from "@/lib/month";
import type { PublicStatusResponse } from "@/lib/types";

const monthOptions = getMonthOptions();

export default function Home() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<PublicStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/status?month=${encodeURIComponent(m)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load status");
      const json: PublicStatusResponse = await res.json();
      setData(json);
    } catch {
      setError("Could not load rent status. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/month-change
    load(month);
  }, [month, load]);

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="bg-primary px-4 py-5 text-white shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {data?.buildingName ?? "SJR Building"}
          </h1>
          <Link
            href="/admin/login"
            className="rounded-md border border-white/40 px-3 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10"
          >
            Admin
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-5">
          <MonthYearSelector month={month} options={monthOptions} onChange={setMonth} />
        </div>

        {loading && (
          <div className="flex flex-col gap-3" aria-live="polite" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-primary-light" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-unpaid/30 bg-unpaid-bg p-4 text-unpaid">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            <div className="mb-5 rounded-xl border border-primary/15 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-foreground/70">Rent Collection Summary</p>
              <p className="mt-1 text-2xl font-bold text-primary-dark">
                {data.paidCount} of {data.totalPlots} Paid
              </p>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-primary-light">
                <div
                  className="h-full rounded-full bg-paid transition-all"
                  style={{
                    width: `${
                      data.totalPlots > 0 ? (data.paidCount / data.totalPlots) * 100 : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {data.plots.length === 0 ? (
              <div className="rounded-xl border border-primary/15 bg-white p-6 text-center text-foreground/60">
                No plots have been added yet.
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {data.plots.map((plot) => (
                  <li
                    key={plot.plotNumber}
                    className="flex items-center justify-between rounded-xl border border-primary/10 bg-white px-4 py-3.5 shadow-sm"
                  >
                    <span className="text-base font-semibold text-foreground">
                      Plot {plot.plotNumber}
                    </span>
                    <StatusBadge status={plot.status} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <footer className="px-4 py-4 text-center text-xs text-foreground/40">
        Tenant details, amounts and payment history are private and only visible to admins.
      </footer>
    </div>
  );
}
