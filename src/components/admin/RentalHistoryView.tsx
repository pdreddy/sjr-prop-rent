"use client";

import { useEffect, useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { formatDate, formatMonthLabel, isRentOverdue } from "@/lib/month";
import type { RentalHistoryMonth, RentalHistoryResponse, RentalHistoryPlot, RentalStay } from "@/lib/types";
import HistoryMonthEditModal from "./HistoryMonthEditModal";
import HistoryTenantEditModal from "./HistoryTenantEditModal";
import { IconEdit, IconSearch } from "@/components/icons";

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

interface MonthEdit { plot: RentalHistoryPlot; month: RentalHistoryMonth; moveInDate: string | null; tenantName: string }

export default function RentalHistoryView({ onUnauthorized, onChanged }: { onUnauthorized: () => void; onChanged?: () => void }) {
  const [data, setData] = useState<RentalHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const [fixing, setFixing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editMonth, setEditMonth] = useState<MonthEdit | null>(null);
  const [editTenant, setEditTenant] = useState<RentalHistoryPlot | null>(null);

  // After any edit: close the dialog, reload this tab and tell the dashboard to refresh its own data,
  // so the change shows up on every tab straight away.
  function handleSaved(message: string) {
    setEditMonth(null);
    setEditTenant(null);
    setNotice(message);
    setReloadKey((k) => k + 1);
    onChanged?.();
  }

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
  }, [onUnauthorized, reloadKey]);

  async function fillMissingMonths() {
    setFixing(true);
    setNotice(null);
    try {
      const call = async (dryRun: boolean) => {
        const res = await fetch("/api/admin/backfill-months", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dryRun }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Request failed.");
        return json as { created: number; adjusted: number; needsReview: number };
      };
      const preview = await call(true);
      const review = preview.needsReview ? ` ${preview.needsReview} move-in month(s) already have payments at full rent and need a manual look.` : "";
      if (preview.created === 0 && preview.adjusted === 0) {
        setNotice(`Nothing to fill — every month already has a record.${review}`);
        return;
      }
      const ok = window.confirm(
        `Create ${preview.created} missing month record(s) and re-price ${preview.adjusted} unpaid move-in month(s) to the days stayed?${review}`
      );
      if (!ok) return;
      const done = await call(false);
      setNotice(`Created ${done.created} month record(s), re-priced ${done.adjusted} move-in month(s).${review}`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not fill missing months.");
    } finally {
      setFixing(false);
    }
  }

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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={fillMissingMonths}
            disabled={fixing}
            className="min-h-10 rounded-xl border border-primary/30 bg-white px-4 text-sm font-semibold text-primary-dark hover:bg-primary-light disabled:opacity-60"
          >
            {fixing ? "Checking…" : "Fill missing months"}
          </button>
          {notice && <span className="text-xs font-medium text-foreground/70">{notice}</span>}
        </div>
        <p className="mt-2.5 text-xs text-foreground/55">
          Past tenants are rebuilt from recorded plot edits, so a tenant who was set up before edits were logged may show
          only as the current tenant. Move-out is the date the next tenant moved in (or the plot was marked vacant). Open a plot and click any
          month to edit its rent, payment, paid date, meter readings or notes, move it to the right month, or delete it; use &ldquo;Edit
          move-in &amp; rent&rdquo; on the current tenant to fix the move-in date. Changes show on every tab straight away.
        </p>
      </div>

      {plots.length === 0 && (
        <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">No plots match your search.</div>
      )}

      {plots.map((plot) => (
        <PlotHistory
          key={plot.unitId}
          plot={plot}
          expanded={open === plot.unitId}
          onToggle={() => setOpen(open === plot.unitId ? null : plot.unitId)}
          onEditMonth={(month, moveInDate, tenantName) => setEditMonth({ plot, month, moveInDate, tenantName })}
          onEditTenant={() => setEditTenant(plot)}
        />
      ))}

      {editMonth && (
        <HistoryMonthEditModal
          key={`${editMonth.plot.unitId}-${editMonth.month.month}`}
          plot={editMonth.plot}
          moveInDate={editMonth.moveInDate}
          tenantName={editMonth.tenantName}
          month={editMonth.month}
          onClose={() => setEditMonth(null)}
          onSaved={handleSaved}
        />
      )}
      {editTenant && <HistoryTenantEditModal plot={editTenant} onClose={() => setEditTenant(null)} onSaved={handleSaved} />}
    </div>
  );
}

const DOT_STYLE: Record<RowTone, string> = { paid: "bg-paid", overdue: "bg-unpaid", due: "bg-partial" };
const CARD_STYLE: Record<RowTone, string> = {
  paid: "border-l-paid bg-paid-bg/30",
  overdue: "border-l-unpaid bg-unpaid-bg/40",
  due: "border-l-partial bg-partial-bg/40",
};

type EditMonthFn = (month: RentalHistoryMonth, moveInDate: string | null, tenantName: string) => void;

function PlotHistory({ plot, expanded, onToggle, onEditMonth, onEditTenant }: { plot: RentalHistoryPlot; expanded: boolean; onToggle: () => void; onEditMonth: EditMonthFn; onEditTenant: () => void }) {
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
                  {m.balanceDue > 0 ? ` ${rupees(m.balanceDue)}` : ""}
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
            <Stay
              key={`${stay.tenantName}-${stay.startMonth}-${i}`}
              stay={stay}
              onEditMonth={(m) => onEditMonth(m, stay.moveInDate, stay.tenantName)}
              onEditTenant={stay.endMonth === null ? onEditTenant : undefined}
            />
          ))}
          {plot.otherRecords.length > 0 && <OtherRecords plot={plot} onEditMonth={(m) => onEditMonth(m, plot.moveInDate, plot.currentTenant ?? "Vacant")} />}
        </div>
      )}
    </section>
  );
}

function Stay({ stay, onEditMonth, onEditTenant }: { stay: RentalStay; onEditMonth: (m: RentalHistoryMonth) => void; onEditTenant?: () => void }) {
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-primary-dark">
            {stay.monthsPaid} of {stay.months.length} months paid · {rupees(stay.totalPaid)} received
          </p>
          {onEditTenant && (
            <button type="button" onClick={onEditTenant} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary/30 bg-white px-3 text-xs font-semibold text-primary-dark hover:bg-primary-light">
              <IconEdit className="h-3.5 w-3.5" />
              Edit move-in &amp; rent
            </button>
          )}
        </div>
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
              <tr
                key={m.month}
                onClick={() => onEditMonth(m)}
                title="Click to edit this month"
                className={`cursor-pointer hover:brightness-95 ${ROW_STYLE[tone]}`}
              >
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
                <td className="px-3 py-2 text-right">
                  {rupees(m.due)}
                  {m.proratedDays !== null && (
                    <span className="block text-[11px] text-foreground/45">{m.proratedDays}/30 days</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{m.recorded ? rupees(m.amountPaid) : "—"}</td>
                <td className="px-3 py-2">{m.paidDate ? formatDate(m.paidDate) : "—"}</td>
                <td className={`px-3 py-2 text-right ${tone === "paid" ? "text-paid" : m.balanceDue > 0 ? "font-semibold text-unpaid" : ""}`}>
                  {rupees(m.balanceDue)}
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

// Records that fall outside every tenant stay - typically a payment entered under the wrong month.
function OtherRecords({ plot, onEditMonth }: { plot: RentalHistoryPlot; onEditMonth: (m: RentalHistoryMonth) => void }) {
  return (
    <div className="rounded-xl border border-partial/40 bg-partial-bg/40">
      <div className="px-3 py-2.5">
        <p className="font-bold text-partial">Other records for plot {plot.plotNumber}</p>
        <p className="text-xs text-foreground/60">These months fall outside any tenant&apos;s stay, so they are not counted. Click one to move it to the right month, correct it, or delete it.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <tbody className="divide-y divide-primary/10">
            {plot.otherRecords.map((m) => (
              <tr key={m.month} onClick={() => onEditMonth(m)} title="Click to edit this month" className="cursor-pointer hover:bg-white/60">
                <td className="px-3 py-2 font-medium">{formatMonthLabel(m.month)}</td>
                <td className="px-3 py-2 text-right">Due {rupees(m.due)}</td>
                <td className="px-3 py-2 text-right">Paid {rupees(m.amountPaid)}</td>
                <td className="px-3 py-2">{m.paidDate ? formatDate(m.paidDate) : "—"}</td>
                <td className="px-3 py-2 text-right text-xs font-semibold text-primary-dark">Edit</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
