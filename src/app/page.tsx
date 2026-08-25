"use client";

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import { getCurrentMonth, getMonthOptions, formatDate } from "@/lib/month";
import type { PublicStatusResponse } from "@/lib/types";
import { IconBuilding, IconCalendar, IconSearch } from "@/components/icons";

const monthOptions = getMonthOptions();
const RENT_FILTERS = ["ALL", "PAID", "UNPAID", "PARTIAL", "NA"] as const;
const ELECTRICITY_FILTERS = ["ALL", "PAID", "UNPAID", "NA"] as const;
const RENT_FILTER_LABELS: Record<(typeof RENT_FILTERS)[number], string> = {
  ALL: "All",
  PAID: "Paid",
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  NA: "N/A",
};
const ELECTRICITY_FILTER_LABELS: Record<(typeof ELECTRICITY_FILTERS)[number], string> = {
  ALL: "All",
  PAID: "Paid",
  UNPAID: "Unpaid",
  NA: "N/A",
};

export default function Home() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [search, setSearch] = useState("");
  const [rentFilter, setRentFilter] = useState<(typeof RENT_FILTERS)[number]>("ALL");
  const [electricityFilter, setElectricityFilter] = useState<(typeof ELECTRICITY_FILTERS)[number]>("ALL");
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
      const matchesRent = rentFilter === "ALL" || plot.status === rentFilter;
      const matchesElectricity = electricityFilter === "ALL" || plot.electricityStatus === electricityFilter;
      return matchesSearch && matchesRent && matchesElectricity;
    });
  }, [data, search, rentFilter, electricityFilter]);

  const counts = useMemo(() => {
    const rent = { PAID: 0, UNPAID: 0, PARTIAL: 0, NA: 0 };
    const electricity = { PAID: 0, UNPAID: 0, NA: 0 };
    for (const plot of data?.plots ?? []) {
      rent[plot.status] += 1;
      electricity[plot.electricityStatus] += 1;
    }
    return { rent, electricity };
  }, [data]);

  const paidPct = data && data.totalPlots > 0 ? Math.round((data.paidCount / data.totalPlots) * 100) : 0;
  const electricityPct =
    data && data.totalPlots > 0 ? Math.round((counts.electricity.PAID / data.totalPlots) * 100) : 0;

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

        <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground/45">Rent status</span>
            <div className="flex flex-wrap gap-1.5">
              {RENT_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setRentFilter(f)}
                  className={`min-h-8 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    rentFilter === f
                      ? "border-primary bg-primary text-white"
                      : "border-primary/20 bg-white text-foreground/70 hover:bg-primary-light"
                  }`}
                >
                  {RENT_FILTER_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground/45">Electricity status</span>
            <div className="flex flex-wrap gap-1.5">
              {ELECTRICITY_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setElectricityFilter(f)}
                  className={`min-h-8 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    electricityFilter === f
                      ? "border-primary bg-primary text-white"
                      : "border-primary/20 bg-white text-foreground/70 hover:bg-primary-light"
                  }`}
                >
                  {ELECTRICITY_FILTER_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col gap-3" aria-live="polite" aria-busy="true">
            <div className="h-24 animate-pulse rounded-2xl bg-primary-light" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-primary-light" />
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
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SummaryCard
                title="Rent collection"
                paidCount={data.paidCount}
                totalCount={data.totalPlots}
                pct={paidPct}
              >
                <MiniChip label="Paid" value={counts.rent.PAID} colorClass="bg-paid-bg text-paid" />
                <MiniChip label="Unpaid" value={counts.rent.UNPAID} colorClass="bg-unpaid-bg text-unpaid" />
                <MiniChip label="Partial" value={counts.rent.PARTIAL} colorClass="bg-partial-bg text-partial" />
                <MiniChip label="N/A" value={counts.rent.NA} colorClass="bg-vacant-bg text-vacant" />
              </SummaryCard>

              <SummaryCard
                title="Electricity collection"
                paidCount={counts.electricity.PAID}
                totalCount={data.totalPlots}
                pct={electricityPct}
              >
                <MiniChip label="Paid" value={counts.electricity.PAID} colorClass="bg-paid-bg text-paid" />
                <MiniChip label="Unpaid" value={counts.electricity.UNPAID} colorClass="bg-unpaid-bg text-unpaid" />
                <MiniChip label="N/A" value={counts.electricity.NA} colorClass="bg-vacant-bg text-vacant" />
              </SummaryCard>
            </div>

            {plots.length === 0 ? (
              <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">
                {data.plots.length === 0 ? "No plots have been added yet." : "No plots match your search or filters."}
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {plots.map((plot) => (
                  <li
                    key={plot.plotNumber}
                    className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
                          Plot {plot.plotNumber}
                        </p>
                        <p className="truncate text-base font-bold text-foreground">
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
                      {plot.status === "PAID" && (
                        <span className="flex items-center gap-1.5 text-paid">
                          <span className="h-1.5 w-1.5 rounded-full bg-paid" aria-hidden="true" />
                          {plot.paidDate ? `Paid on ${formatDate(plot.paidDate)}` : "Paid this month"}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-background px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Electricity</p>
                        <p className="text-sm font-bold text-foreground">
                          {plot.electricityStatus === "NA" ? "N/A" : `₹${plot.electricityAmount.toFixed(0)}`}
                        </p>
                        {plot.electricityStatus !== "NA" && (
                          <p className="text-xs text-foreground/50">
                            {plot.prevReading} → {plot.currReading} ({plot.currReading - plot.prevReading} units)
                          </p>
                        )}
                      </div>
                      <StatusBadge status={plot.electricityStatus} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <footer className="px-4 py-6 text-center text-xs text-foreground/40">
        Only payment status is shown here. Phone numbers, rent amounts and notes remain private.
      </footer>
    </div>
  );
}

function SummaryCard({
  title,
  paidCount,
  totalCount,
  pct,
  children,
}: {
  title: string;
  paidCount: number;
  totalCount: number;
  pct: number;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-primary/10 bg-white p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground/55">{title}</p>
          <p className="text-lg font-bold leading-tight text-primary-dark">
            {paidCount}
            <span className="text-sm font-medium text-foreground/40"> / {totalCount}</span>
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary-light px-2.5 py-1 text-xs font-bold text-primary-dark">
          {pct}%
        </span>
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-primary-light">
        <div className="h-full rounded-full bg-paid transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function MiniChip({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${colorClass}`}>
      {value} {label}
    </span>
  );
}
