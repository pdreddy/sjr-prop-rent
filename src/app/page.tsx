"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import { getCurrentMonth, getMonthOptions, formatDate } from "@/lib/month";
import type { PublicStatusResponse } from "@/lib/types";
import { IconBuilding, IconCalendar, IconRupee, IconSearch } from "@/components/icons";

const monthOptions = getMonthOptions();
const STATUS_FILTERS = ["ALL", "PAID", "PARTIAL", "UNPAID"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function Home() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
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

  const plots = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.plots.filter((plot) => {
      const matchesSearch =
        !needle ||
        plot.plotNumber.toLowerCase().includes(needle) ||
        plot.tenantName?.toLowerCase().includes(needle);
      const matchesStatus = statusFilter === "ALL" || plot.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data, search, statusFilter]);

  const paidPct = data && data.totalPlots > 0 ? Math.round((data.paidCount / data.totalPlots) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-primary/10 bg-white/85 px-4 py-3.5 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <IconBuilding className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight text-primary-dark sm:text-lg">
                {data?.buildingName ?? "SJR Building"}
              </h1>
              <p className="text-xs text-foreground/45">Rent status</p>
            </div>
          </div>
          <Link
            href="/admin/login"
            className="rounded-full border border-primary/20 px-3.5 py-1.5 text-sm font-medium text-primary-dark hover:bg-primary-light"
          >
            Admin
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <MonthYearSelector month={month} options={monthOptions} onChange={setMonth} />
          <label className="flex flex-1 min-w-[180px] flex-col gap-1">
            <span className="text-sm font-medium text-primary-dark">Search</span>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Plot or tenant name"
                className="min-h-11 w-full rounded-xl border border-primary/15 bg-white py-2 pl-9 pr-3 text-base shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </label>
        </div>

        <div className="mb-5 flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`min-h-9 rounded-full border px-3 py-1.5 text-sm font-medium ${
                statusFilter === s
                  ? "border-primary bg-primary text-white"
                  : "border-primary/20 bg-white text-foreground/70"
              }`}
            >
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex flex-col gap-3" aria-live="polite" aria-busy="true">
            <div className="h-28 animate-pulse rounded-2xl bg-primary-light" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-primary-light" />
              ))}
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-unpaid/30 bg-unpaid-bg p-4 text-unpaid">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            <div className="mb-6 overflow-hidden rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground/60">Rent collection summary</p>
                  <p className="mt-1 text-3xl font-bold text-primary-dark">
                    {data.paidCount}
                    <span className="text-lg font-medium text-foreground/40"> / {data.totalPlots} paid</span>
                  </p>
                </div>
                <div className="relative flex h-20 w-20 items-center justify-center">
                  <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-primary-light)" strokeWidth="3.5" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="var(--color-paid)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeDasharray={`${(paidPct / 100) * 97.4} 97.4`}
                    />
                  </svg>
                  <span className="absolute text-sm font-bold text-primary-dark">{paidPct}%</span>
                </div>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-primary-light">
                <div
                  className="h-full rounded-full bg-paid transition-all"
                  style={{ width: `${paidPct}%` }}
                />
              </div>
            </div>

            {plots.length === 0 ? (
              <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">
                {data.plots.length === 0 ? "No plots have been added yet." : "No plots match your search."}
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {plots.map((plot) => (
                  <li
                    key={plot.plotNumber}
                    className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
                          Plot {plot.plotNumber}
                        </p>
                        <p className="text-base font-bold text-foreground">
                          {plot.tenantName || "No tenant"}
                        </p>
                      </div>
                      <StatusBadge status={plot.status} />
                    </div>
                    <div className="mt-3 flex flex-col gap-1.5 text-sm text-foreground/70">
                      <span className="flex items-center gap-1.5">
                        <IconCalendar className="h-4 w-4 text-foreground/35" />
                        Joined {formatDate(plot.moveInDate)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <IconRupee className="h-4 w-4 text-foreground/35" />
                        ₹{plot.amountPaid.toFixed(0)} paid
                        {plot.paidDate ? ` on ${formatDate(plot.paidDate)}` : " · no paid date yet"}
                      </span>
                    </div>

                    <div className="mt-3 rounded-xl bg-primary-light/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground/70">
                          Electricity{plot.electricityStatus !== "NA" ? `: ₹${plot.electricityAmount.toFixed(0)}` : ""}
                        </span>
                        <StatusBadge status={plot.electricityStatus} />
                      </div>
                      {plot.electricityStatus !== "NA" && (
                        <p className="mt-1 text-xs text-foreground/50">
                          {plot.electricityPreviousReading} → {plot.electricityCurrentReading} (
                          {plot.electricityCurrentReading - plot.electricityPreviousReading} units)
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <footer className="px-4 py-6 text-center text-xs text-foreground/40">
        Phone numbers, rent charges and notes are private. Payment amount and paid date are shown for transparency.
      </footer>
    </div>
  );
}
