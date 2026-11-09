"use client";

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import { getCurrentMonth, getMonthOptions, formatDate, formatMonthLabel } from "@/lib/month";
import { rupee, shortMonth } from "@/lib/format";
import InstallApp from "@/components/InstallApp";
import type { PublicPlot, PublicStatusResponse } from "@/lib/types";
import { IconBuilding, IconCalendar, IconSearch } from "@/components/icons";

const monthOptions = getMonthOptions();
const RENT_FILTERS = ["ALL", "PAID", "DUE", "UNPAID", "PARTIAL", "NA"] as const;
const ELECTRICITY_FILTERS = ["ALL", "PAID", "UNPAID", "NA"] as const;
const RENT_FILTER_LABELS: Record<(typeof RENT_FILTERS)[number], string> = {
  ALL: "All",
  PAID: "Paid",
  DUE: "Due",
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

// A plot needs attention when its rent is unpaid/partial or its electricity is unpaid.
// "Due" (still inside the payment window) and N/A are not flagged.
const needsAttention = (plot: PublicPlot) => plot.status === "UNPAID" || plot.status === "PARTIAL" || plot.electricityStatus === "UNPAID";

export default function Home() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [search, setSearch] = useState("");
  const [rentFilter, setRentFilter] = useState<(typeof RENT_FILTERS)[number]>("ALL");
  const [electricityFilter, setElectricityFilter] = useState<(typeof ELECTRICITY_FILTERS)[number]>("ALL");
  const [attentionOnly, setAttentionOnly] = useState(false);
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
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Failed to load status");
      }
      const json: PublicStatusResponse = await res.json();
      setData(json);
    } catch (err) {
      // The server message is detailed in development (e.g. missing Firebase credentials) and generic in production.
      const reason = err instanceof Error && err.message !== "Failed to load status" && err.message !== "Failed to fetch" ? ` (${err.message})` : "";
      setError(`Could not load rent status${reason}. Please try again.`);
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
      return matchesSearch && matchesRent && matchesElectricity && (!attentionOnly || needsAttention(plot));
    });
  }, [data, search, rentFilter, electricityFilter, attentionOnly]);

  const attention = useMemo(() => {
    const list = (data?.plots ?? []).filter(needsAttention);
    return {
      count: list.length,
      rent: list.filter((p) => p.status === "UNPAID" || p.status === "PARTIAL").length,
      electricity: list.filter((p) => p.electricityStatus === "UNPAID").length,
    };
  }, [data]);

  const counts = useMemo(() => {
    const rent = { PAID: 0, DUE: 0, UNPAID: 0, PARTIAL: 0, NA: 0 };
    const electricity = { PAID: 0, UNPAID: 0, NA: 0 };
    for (const plot of data?.plots ?? []) {
      rent[plot.status] += 1;
      electricity[plot.electricityStatus] += 1;
    }
    return { rent, electricity };
  }, [data]);

// Progress only counts plots that apply this month: a tenant who has not moved in yet (or a vacant plot)
  // is N/A and is left out of the totals.
  const rentTotal = counts.rent.PAID + counts.rent.DUE + counts.rent.UNPAID + counts.rent.PARTIAL;
  const electricityTotal = counts.electricity.PAID + counts.electricity.UNPAID;
  const paidPct = rentTotal > 0 ? Math.round((counts.rent.PAID / rentTotal) * 100) : 0;
  const electricityPct = electricityTotal > 0 ? Math.round((counts.electricity.PAID / electricityTotal) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary text-white">
              <IconBuilding className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight text-ink sm:text-lg">{data?.buildingName ?? "SJR Building"}</h1>
              <p className="text-xs text-muted">Rent status{data ? ` · Electricity ${rupee(data.ratePerUnit)}/unit` : ""}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <InstallApp />
            <Link href="/admin/login" className="rounded-full border border-line-strong px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-primary-light">
              Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 sm:px-6">
        {data?.notice && (
          <div className="mb-4 whitespace-pre-line rounded-card border border-partial/30 bg-partial-bg px-4 py-3 text-sm font-medium text-partial">{data.notice}</div>
        )}

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <MonthYearSelector month={month} options={monthOptions} onChange={setMonth} />
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="label-caps">Search</span>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                suppressHydrationWarning
                placeholder={data?.plots.some((p) => p.tenantName) ? "Plot or tenant name" : "Plot number"}
                className="min-h-11 w-full rounded-control border border-line-strong bg-white py-2 pl-9 pr-3 text-base shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </label>
        </div>

        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
          <FilterRow label="Rent" options={RENT_FILTERS} labels={RENT_FILTER_LABELS} value={rentFilter} onChange={setRentFilter} />
          <FilterRow label="Electricity" options={ELECTRICITY_FILTERS} labels={ELECTRICITY_FILTER_LABELS} value={electricityFilter} onChange={setElectricityFilter} />
        </div>

        {loading && (
          <div className="flex flex-col gap-3" aria-live="polite" aria-busy="true">
            <div className="h-20 animate-pulse rounded-card bg-primary-light" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-card bg-primary-light" />
            ))}
          </div>
        )}

        {!loading && error && <div className="rounded-card border border-unpaid/30 bg-unpaid-bg p-4 text-unpaid">{error}</div>}

        {!loading && !error && data && (
          <>
            <button
              onClick={() => setAttentionOnly((v) => !v)}
              aria-pressed={attentionOnly}
              className={`mb-4 flex w-full items-center justify-between gap-3 rounded-card border px-4 py-3 text-left shadow-card transition-colors ${
                attention.count === 0 ? "border-paid/30 bg-paid-bg" : attentionOnly ? "border-unpaid bg-unpaid-bg" : "border-unpaid/30 bg-white hover:bg-unpaid-bg/50"
              }`}
            >
              <span className="min-w-0">
                {attention.count === 0 ? (
                  <span className="font-semibold text-paid">Everything is up to date for {formatMonthLabel(data.month)}</span>
                ) : (
                  <>
                    <span className="block font-semibold text-unpaid">
                      {attention.count} {attention.count === 1 ? "plot needs" : "plots need"} attention
                    </span>
                    <span className="block text-xs text-muted">
                      {attention.rent} rent unpaid or partial · {attention.electricity} electricity unpaid
                    </span>
                  </>
                )}
              </span>
              {attention.count > 0 && <span className="shrink-0 text-xs font-semibold text-ink">{attentionOnly ? "Show all" : "Show only these"}</span>}
            </button>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <SummaryCard title="Rent collection" paidCount={counts.rent.PAID} totalCount={rentTotal} pct={paidPct}>
                <MiniChip label="Paid" value={counts.rent.PAID} colorClass="bg-paid-bg text-paid" />
                <MiniChip label="Due" value={counts.rent.DUE} colorClass="bg-partial-bg text-partial" />
                <MiniChip label="Unpaid" value={counts.rent.UNPAID} colorClass="bg-unpaid-bg text-unpaid" />
                <MiniChip label="Partial" value={counts.rent.PARTIAL} colorClass="bg-partial-bg text-partial" />
                <MiniChip label="N/A" value={counts.rent.NA} colorClass="bg-vacant-bg text-vacant" />
              </SummaryCard>
              <SummaryCard title="Electricity collection" paidCount={counts.electricity.PAID} totalCount={electricityTotal} pct={electricityPct}>
                <MiniChip label="Paid" value={counts.electricity.PAID} colorClass="bg-paid-bg text-paid" />
                <MiniChip label="Unpaid" value={counts.electricity.UNPAID} colorClass="bg-unpaid-bg text-unpaid" />
                <MiniChip label="N/A" value={counts.electricity.NA} colorClass="bg-vacant-bg text-vacant" />
              </SummaryCard>
            </div>

            {plots.length === 0 ? (
              <div className="rounded-card border border-line bg-white p-8 text-center text-muted">
                {data.plots.length === 0 ? "No plots have been added yet." : "No plots match your search or filters."}
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3">
                {plots.map((plot) => (
                  <PlotCard key={plot.plotNumber} plot={plot} selectedMonth={data.month} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <footer className="px-4 py-6 text-center text-xs text-muted">Only payment status is shown here. Phone numbers, rent amounts and notes remain private.</footer>
    </div>
  );
}

function FilterRow<T extends string>({ label, options, labels, value, onChange }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-caps">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((f) => (
          <button
            key={f}
            onClick={() => onChange(f)}
            className={`min-h-8 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${value === f ? "border-primary bg-primary text-white" : "border-line-strong bg-white text-muted hover:bg-primary-light"}`}
          >
            {labels[f]}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlotCard({ plot, selectedMonth }: { plot: PublicPlot; selectedMonth: string }) {
  const flagged = needsAttention(plot);
  const edge = plot.status === "UNPAID" ? "border-l-4 border-l-unpaid" : flagged ? "border-l-4 border-l-partial" : "";
  return (
    <li className={`rounded-card border border-line bg-white p-4 shadow-card ${edge}`}>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold leading-tight text-ink">
          <span className="label-caps mr-1.5 align-middle">Plot</span>
          {plot.plotNumber}
        </p>
        {plot.tenantName && <p className="truncate text-sm font-medium text-foreground/80">{plot.tenantName}</p>}
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <IconCalendar className="h-3.5 w-3.5" />
          Joined {formatDate(plot.moveInDate)}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-control bg-primary-light px-3 py-2.5">
          <p className="label-caps">Rent</p>
          <div className="mt-1">
            <StatusBadge status={plot.status} />
          </div>
          {plot.status === "PAID" && <p className="mt-1.5 text-xs text-paid">{plot.paidDate ? `Paid on ${formatDate(plot.paidDate)}` : "Paid this month"}</p>}
        </div>
        <div className="rounded-control bg-primary-light px-3 py-2.5">
          <p className="label-caps">Electricity</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="money">{plot.electricityStatus === "NA" ? "—" : rupee(plot.electricityAmount)}</span>
            <StatusBadge status={plot.electricityStatus} />
          </div>
          {plot.electricityBalance > 0 && plot.electricityStatus !== "NA" && <p className="mt-1.5 text-xs font-semibold text-unpaid">{rupee(plot.electricityBalance)} due</p>}
        </div>
      </div>

      <ElectricityHistory plot={plot} selectedMonth={selectedMonth} />
    </li>
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
    <div className="rounded-card border border-line bg-white p-3.5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground/55">{title}</p>
          <p className="text-lg font-bold leading-tight text-ink">
            {paidCount}
            <span className="text-sm font-medium text-foreground/40"> / {totalCount}</span>
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary-light px-2.5 py-1 text-xs font-bold text-ink">
          {pct}%
        </span>
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-primary-light">
        <div className="h-full rounded-full bg-paid transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2.5 hidden flex-wrap gap-1.5 sm:flex">{children}</div>
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

// Every month of electricity for one plot: meter reading, units, bill, paid, and whether it is settled.
function ElectricityHistory({ plot, selectedMonth }: { plot: PublicPlot; selectedMonth: string }) {
  const months = plot.electricityMonths;
  return (
    <details className="group mt-3 overflow-hidden rounded-control border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <p className="label-caps">Electricity history</p>
        <span className="flex items-center gap-2">
          {months.length > 0 && (
            <span className={`text-xs font-bold ${plot.electricityTotals.due > 0 ? "text-unpaid" : "text-paid"}`}>
              {plot.electricityTotals.due > 0 ? `${rupee(plot.electricityTotals.due)} due` : "All paid"}
            </span>
          )}
          <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
        </span>
      </summary>

      {months.length === 0 ? (
        <p className="px-3 py-3 text-sm text-foreground/55">No electricity records yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-x-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/45">
            <span>Month</span>
            <span className="text-right">Units</span>
            <span className="text-right">Bill</span>
            <span className="text-right">Paid</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="divide-y divide-line">
            {months.map((m) => (
              <li
                key={m.month}
                className={`grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)] items-center gap-x-2 px-3 py-2 text-sm ${m.month === selectedMonth ? "bg-primary-light/50" : ""}`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{shortMonth(m.month)}</p>
                  <p className="truncate text-[11px] text-foreground/50">{m.isDefault ? "default bill" : `${m.prevReading} → ${m.currReading}`}</p>
                </div>
                <span className="text-right text-foreground/80">{m.isDefault ? "—" : m.units}</span>
                <span className="text-right font-semibold text-foreground">{rupee(m.bill)}</span>
                <span className={`text-right ${m.paid > 0 ? "font-semibold text-paid" : "text-foreground/45"}`}>{rupee(m.paid)}</span>
                <span className="flex justify-end">
                  <StatusBadge status={m.status} />
                </span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)] items-center gap-x-2 border-t-2 border-line bg-primary-light/60 px-3 py-2 text-sm font-bold text-ink">
            <span>Total</span>
            <span />
            <span className="text-right">{rupee(plot.electricityTotals.billed)}</span>
            <span className="text-right text-paid">{rupee(plot.electricityTotals.paid)}</span>
            <span className={`text-right ${plot.electricityTotals.due > 0 ? "text-unpaid" : "text-paid"}`}>{plot.electricityTotals.due > 0 ? rupee(plot.electricityTotals.due) : "Paid"}</span>
          </div>
        </>
      )}
    </details>
  );
}
