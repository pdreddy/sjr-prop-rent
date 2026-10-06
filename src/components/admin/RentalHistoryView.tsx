"use client";

import { useEffect, useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { formatDate, formatMonthLabel, isRentOverdue } from "@/lib/month";
import type { RentalHistoryMonth, RentalHistoryResponse, RentalHistoryPlot, RentalStay } from "@/lib/types";
import { IconSearch } from "@/components/icons";

const rupees = (n: number) => `₹${n.toFixed(0)}`;

// Green = paid in full. Red = still pending (unpaid, partly paid, or nothing recorded) and past the
// first-week-of-next-month payment window. Amber = pending but not yet overdue.
type RowTone = "paid" | "overdue" | "due";
function rowTone(m: RentalHistoryMonth): RowTone {
  if (m.recorded && m.status === "PAID") return "paid";
  return isRentOverdue(m.month) ? "overdue" : "due";
}
const ROW_STYLE: Record<RowTone, string> = {
  paid: "bg-paid-bg/50 border-l-4 border-l-paid",
  overdue: "bg-unpaid-bg/70 border-l-4 border-l-unpaid",
  due: "bg-partial-bg/60 border-l-4 border-l-partial",
};

export default function RentalHistoryView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<RentalHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/rental-history", { cache: "no-store" });
        if (res.status === 401) return onUnauthorized();
        if (!res.ok) throw new Error("Failed to load");
        const json: RentalHistoryResponse = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not load rental history. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onUnauthorized]);

  const plots = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.plots ?? []).filter(
      (p) =>
        !needle ||
        p.plotNumber.toLowerCase().includes(needle) ||
        p.stays.some((s) => s.tenantName.toLowerCase().includes(needle))
    );
  }, [data, search]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-primary-light" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return <div className="rounded-xl border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">{error}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-primary/10 bg-white p-3.5 shadow-sm sm:p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-primary-dark">Search</span>
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Plot or any past/current tenant"
              className="min-h-11 w-full rounded-xl border border-primary/20 bg-white py-2 pl-9 pr-3 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </label>
        <p className="mt-2.5 text-xs text-foreground/55">
          Past tenants are rebuilt from recorded plot edits, so a tenant who was set up before edits were logged may show
          only as the current tenant. Move-out is the date the next tenant moved in (or the plot was marked vacant).
        </p>
      </div>

      {plots.length === 0 && (
        <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">No plots match your search.</div>
      )}

      {plots.map((plot) => (
        <PlotHistory key={plot.unitId} plot={plot} expanded={open === plot.unitId} onToggle={() => setOpen(open === plot.unitId ? null : plot.unitId)} />
      ))}
    </div>
  );
}

const DOT_STYLE: Record<RowTone, string> = { paid: "bg-paid", overdue: "bg-unpaid", due: "bg-partial" };
const CARD_STYLE: Record<RowTone, string> = {
  paid: "border-l-paid bg-paid-bg/30",
  overdue: "border-l-unpaid bg-unpaid-bg/40",
  due: "border-l-partial bg-partial-bg/40",
};

function PlotHistory({ plot, expanded, onToggle }: { plot: RentalHistoryPlot; expanded: boolean; onToggle: () => void }) {
  // Summary visible without expanding: every month of every stay, coloured by payment state.
  const months = plot.stays.flatMap((stay) => stay.months).sort((a, b) => a.month.localeCompare(b.month));
  const tones = months.map((m) => ({ m, tone: rowTone(m) }));
  const paid = tones.filter((t) => t.tone === "paid").length;
  const overdue = tones.filter((t) => t.tone === "overdue");
  const due = tones.filter((t) => t.tone === "due").length;
  const overall: RowTone = overdue.length > 0 ? "overdue" : due > 0 ? "due" : "paid";
  const shown = overdue.slice(0, 6);

  return (
    <section className={`rounded-2xl border border-l-4 border-primary/10 shadow-sm ${months.length ? CARD_STYLE[overall] : "border-l-primary/20 bg-white"}`}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full flex-col gap-2.5 p-3.5 text-left sm:p-4">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-extrabold leading-tight text-primary-dark">Plot {plot.plotNumber}</p>
            <p className="truncate text-sm text-foreground/60">{plot.currentTenant ?? "Vacant"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm text-foreground/60">
            <span>{plot.stays.length} tenant{plot.stays.length === 1 ? "" : "s"}</span>
            <span aria-hidden="true">{expanded ? "−" : "+"}</span>
          </div>
        </div>

        {months.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1" aria-label="Month-by-month payment status">
              {tones.map(({ m, tone }) => (
                <span
                  key={m.month}
                  title={`${formatMonthLabel(m.month)}: ${tone === "paid" ? "Paid" : tone === "overdue" ? "Pending" : "Due"}`}
                  className={`h-3 w-3 rounded-sm ${DOT_STYLE[tone]}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <span className="rounded-full bg-paid-bg px-2 py-0.5 text-paid">{paid} paid</span>
              {overdue.length > 0 && (
                <span className="rounded-full bg-unpaid-bg px-2 py-0.5 text-unpaid">{overdue.length} pending</span>
              )}
              {due > 0 && <span className="rounded-full bg-partial-bg px-2 py-0.5 text-partial">{due} due</span>}
              {shown.map(({ m }) => (
                <span key={m.month} className="rounded-full border border-unpaid/30 bg-white px-2 py-0.5 text-unpaid">
                  {formatMonthLabel(m.month)}
                  {m.recorded && m.balanceDue > 0 ? ` ${rupees(m.balanceDue)}` : ""}
                </span>
              ))}
              {overdue.length > shown.length && <span className="text-unpaid">+{overdue.length - shown.length} more</span>}
            </div>
          </>
        )}
      </button>
      {expanded && (
        <div className="flex flex-col gap-4 border-t border-primary/10 p-3.5 sm:p-4">
          {plot.stays.length === 0 && <p className="text-sm text-foreground/60">No tenant history recorded for this plot.</p>}
          {plot.stays.map((stay, i) => (
            <Stay key={`${stay.tenantName}-${stay.startMonth}-${i}`} stay={stay} />
          ))}
        </div>
      )}
    </section>
  );
}

function Stay({ stay }: { stay: RentalStay }) {
  const current = stay.endMonth === null;
  return (
    <div className="rounded-xl border border-primary/10">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl bg-primary-light px-3 py-2.5">
        <div>
          <p className="font-bold text-primary-dark">{stay.tenantName}</p>
          <p className="text-xs text-primary-dark/70">
            Moved in {formatDate(stay.moveInDate)} ·{" "}
            {current ? "Current tenant" : `Moved out ${formatDate(stay.movedOutDate)}`}
          </p>
        </div>
        <p className="text-xs font-medium text-primary-dark">
          {stay.monthsPaid} of {stay.months.length} months paid · {rupees(stay.totalPaid)} received
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-foreground/45">
            <tr>
              <th className="px-3 py-2 font-semibold">Month</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Due</th>
              <th className="px-3 py-2 text-right font-semibold">Paid</th>
              <th className="px-3 py-2 font-semibold">Paid on</th>
              <th className="px-3 py-2 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary/10">
            {stay.months.map((m) => {
              const tone = rowTone(m);
              return (
              <tr key={m.month} className={ROW_STYLE[tone]}>
                <td className="px-3 py-2 font-medium">{formatMonthLabel(m.month)}</td>
                <td className="px-3 py-2">
                  {m.recorded && m.status && !(m.status === "UNPAID" && tone === "due") ? (
                    <StatusBadge status={m.status} />
                  ) : tone === "due" ? (
                    <StatusBadge status="DUE" />
                  ) : (
                    <span className="text-xs font-semibold text-unpaid">No record</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{m.recorded ? rupees(m.due) : "—"}</td>
                <td className="px-3 py-2 text-right">{m.recorded ? rupees(m.amountPaid) : "—"}</td>
                <td className="px-3 py-2">{m.paidDate ? formatDate(m.paidDate) : "—"}</td>
                <td className={`px-3 py-2 text-right ${tone === "paid" ? "text-paid" : m.balanceDue > 0 ? "font-semibold text-unpaid" : ""}`}>
                  {m.recorded ? rupees(m.balanceDue) : "—"}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
