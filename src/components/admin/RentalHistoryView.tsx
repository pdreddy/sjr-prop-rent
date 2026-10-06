"use client";

import { useEffect, useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { formatDate, formatMonthLabel } from "@/lib/month";
import type { RentalHistoryResponse, RentalHistoryPlot, RentalStay } from "@/lib/types";
import { IconSearch } from "@/components/icons";

const rupees = (n: number) => `₹${n.toFixed(0)}`;

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

function PlotHistory({ plot, expanded, onToggle }: { plot: RentalHistoryPlot; expanded: boolean; onToggle: () => void }) {
  return (
    <section className="rounded-2xl border border-primary/10 bg-white shadow-sm">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center justify-between gap-3 p-3.5 text-left sm:p-4">
        <div className="min-w-0">
          <p className="text-xl font-extrabold leading-tight text-primary-dark">Plot {plot.plotNumber}</p>
          <p className="truncate text-sm text-foreground/60">{plot.currentTenant ?? "Vacant"}</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-foreground/60">
          <span>{plot.stays.length} tenant{plot.stays.length === 1 ? "" : "s"}</span>
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </div>
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
            {stay.months.map((m) => (
              <tr key={m.month}>
                <td className="px-3 py-2 font-medium">{formatMonthLabel(m.month)}</td>
                <td className="px-3 py-2">
                  {m.recorded && m.status ? (
                    <StatusBadge status={m.status} />
                  ) : (
                    <span className="text-xs text-foreground/45">No record</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{m.recorded ? rupees(m.due) : "—"}</td>
                <td className="px-3 py-2 text-right">{m.recorded ? rupees(m.amountPaid) : "—"}</td>
                <td className="px-3 py-2">{m.paidDate ? formatDate(m.paidDate) : "—"}</td>
                <td className={`px-3 py-2 text-right ${m.balanceDue > 0 ? "font-semibold text-unpaid" : ""}`}>
                  {m.recorded ? rupees(m.balanceDue) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
