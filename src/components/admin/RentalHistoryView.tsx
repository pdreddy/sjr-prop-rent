"use client";

import { Toolbar, ToolbarButton } from "./ui";
import { useEffect, useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { formatDate, formatMonthLabel, isRentOverdue } from "@/lib/month";
import { buildPlotMessage, MESSAGE_LABELS, suggestedMessage, whatsappNumber, type MessageKind } from "@/lib/plotMessages";
import type { RentalHistoryMonth, RentalHistoryResponse, RentalHistoryPlot, RentalStay, PlotSummary } from "@/lib/types";
import HistoryMonthEditModal from "./HistoryMonthEditModal";
import HistoryTenantEditModal from "./HistoryTenantEditModal";
import { IconEdit } from "@/components/icons";
import { rupee as rupees } from "@/lib/format";


// Green = paid in full. Red = still pending (unpaid, partly paid, or nothing recorded) and past the
// first-week-of-next-month payment window. Amber = pending but not yet overdue.
type RowTone = "paid" | "overdue" | "due";
function rowTone(m: RentalHistoryMonth): RowTone {
  if (m.status === "PAID") return "paid"; // includes a month covered by rent paid ahead
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
          <div key={i} className="h-16 animate-pulse rounded-control bg-primary-light" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return <div className="rounded-control border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">{error}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        title="Rental history"
        subtitle="Every tenant a plot has had, and every month's record"
        search={{ value: search, onChange: setSearch, placeholder: "Plot or any past/current tenant" }}
        actions={<ToolbarButton onClick={fillMissingMonths} disabled={fixing}>{fixing ? "Checking…" : "Fill missing months"}</ToolbarButton>}
        extra={notice ? <p className="text-xs font-medium text-foreground/70">{notice}</p> : null}
        help={
          <>
          Past tenants are rebuilt from recorded plot edits, so a tenant who was set up before edits were logged may show
          only as the current tenant. Move-out is the date the next tenant moved in (or the plot was marked vacant). Open a plot and click any
          month to edit its rent, payment, paid date, meter readings or notes, move it to the right month, or delete it; use &ldquo;Edit
          move-in &amp; rent&rdquo; on the current tenant to fix the move-in date. Changes show on every tab straight away.
</>
        }
      />

      {plots.length === 0 && (
        <div className="rounded-card border border-line bg-white p-8 text-center text-foreground/60">No plots match your search.</div>
      )}

      {plots.map((plot) => (
        <PlotHistory
          buildingName={data?.buildingName ?? "SJR Building"}
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

function PlotHistory({ plot, buildingName, expanded, onToggle, onEditMonth, onEditTenant }: { plot: RentalHistoryPlot; buildingName: string; expanded: boolean; onToggle: () => void; onEditMonth: EditMonthFn; onEditTenant: () => void }) {
  // Summary visible without expanding: every month of every stay, coloured by payment state.
  const months = plot.stays.flatMap((stay) => stay.months).sort((a, b) => a.month.localeCompare(b.month));
  const tones = months.map((m) => ({ m, tone: rowTone(m) }));
  const paid = tones.filter((t) => t.tone === "paid").length;
  const overdue = tones.filter((t) => t.tone === "overdue");
  const due = tones.filter((t) => t.tone === "due").length;
  const overall: RowTone = overdue.length > 0 ? "overdue" : due > 0 ? "due" : "paid";
  const shown = overdue.slice(0, 6);

  return (
    <section className={`rounded-card border border-l-4 border-line shadow-card ${months.length ? CARD_STYLE[overall] : "border-l-primary/20 bg-white"}`}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full flex-col gap-2.5 p-3.5 text-left sm:p-4">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-extrabold leading-tight text-ink">Plot {plot.plotNumber}</p>
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
        <div className="flex flex-col gap-4 border-t border-line p-3.5 sm:p-4">
          {plot.summary && <PlotSummaryCard summary={plot.summary} plot={plot} buildingName={buildingName} pastTenants={plot.stays.filter((stay) => stay.endMonth !== null)} />}
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

const RATING_STYLE: Record<PlotSummary["rating"], string> = {
  good: "bg-paid-bg text-paid",
  mixed: "bg-partial-bg text-partial",
  poor: "bg-unpaid-bg text-unpaid",
  new: "bg-vacant-bg text-vacant",
};
const NOTE_DOT: Record<PlotSummary["notes"][number]["tone"], string> = { good: "bg-paid", warn: "bg-partial", bad: "bg-unpaid" };

// How the current tenant pays, at a glance: a verdict, a few plain sentences, the key numbers and the
// months worth knowing about. All of it comes from the same ledger as the table below.
function PlotSummaryCard({ summary, plot, buildingName, pastTenants }: { summary: PlotSummary; plot: RentalHistoryPlot; buildingName: string; pastTenants: RentalStay[] }) {
  const tenantName = plot.currentTenant ?? "";
  const { months, timing, rent, electricity, lastPayment } = summary;
  const tiles: { label: string; value: string; sub?: string; tone?: "bad" | "good" }[] = [
    { label: "Months paid", value: `${months.paidInFull} / ${months.billed}`, sub: [months.overdue ? `${months.overdue} pending` : "", months.dueNow ? `${months.dueNow} due now` : ""].filter(Boolean).join(" · ") || (months.billed ? "All paid" : undefined) },
    { label: "On time", value: timing.onTime + timing.late ? `${timing.onTime} / ${timing.onTime + timing.late}` : "—", sub: timing.late ? `${timing.late} late, ~${timing.avgDaysLate} days` : timing.usualDay !== null ? (timing.usualDay < 1 ? "Pays before the month" : `Usually day ${Math.min(timing.usualDay, 31)}`) : undefined },
    { label: "Rent pending", value: rupees(rent.balance), sub: `${rupees(rent.paid)} of ${rupees(rent.due)} paid${rent.advance > 0 ? ` · ${rupees(rent.advance)} ahead` : ""}`, tone: rent.balance > 0 ? "bad" : "good" },
    { label: "Electricity due", value: rupees(electricity.balance), sub: `${rupees(electricity.paid)} of ${rupees(electricity.billed)} paid`, tone: electricity.balance > 0 ? "bad" : "good" },
  ];
  return (
    <div className="rounded-control border border-line bg-white p-3 sm:p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="label-caps">Summary{tenantName ? ` · ${tenantName}` : ""}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${RATING_STYLE[summary.rating]}`}>{summary.title}</span>
        {lastPayment && (
          <span className="ml-auto text-xs text-foreground/55">
            Last payment {rupees(lastPayment.amount)} on {formatDate(lastPayment.date)}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-foreground/80">{summary.text}</p>
      <dl className="mt-2.5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg bg-primary-light px-3 py-2">
            <dt className="label-caps">{tile.label}</dt>
            <dd className={`text-lg font-bold leading-tight ${tile.tone === "bad" ? "text-unpaid" : tile.tone === "good" ? "text-paid" : "text-ink"}`}>{tile.value}</dd>
            {tile.sub && <dd className="text-xs text-foreground/55">{tile.sub}</dd>}
          </div>
        ))}
      </dl>
      <MessageComposer summary={summary} plot={plot} buildingName={buildingName} />
      {(summary.notes.length > 0 || pastTenants.length > 0) && (
        <ul className="mt-2.5 grid gap-x-6 gap-y-1 text-sm text-foreground/75 sm:grid-cols-2">
          {summary.notes.map((note) => (
            <li key={note.text} className="flex items-baseline gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full ${NOTE_DOT[note.tone]}`} aria-hidden="true" />
              {note.text}
            </li>
          ))}
          {pastTenants.map((stay) => (
            <li key={`${stay.tenantName}-${stay.startMonth}`} className="flex items-baseline gap-2">
              <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-vacant" aria-hidden="true" />
              Earlier tenant: {stay.tenantName} ({formatDate(stay.moveInDate)} – {formatDate(stay.movedOutDate)}), {stay.monthsPaid} of {stay.months.length} months paid
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MESSAGE_KINDS: MessageKind[] = ["thanks", "reminder", "warning"];
const KIND_STYLE: Record<MessageKind, string> = { thanks: "text-paid", reminder: "text-partial", warning: "text-unpaid" };

// Write a thank-you, reminder or warning from the summary and hand it to WhatsApp or SMS on this device.
// Nothing is sent by the app itself: the admin sees and edits the text, then sends it from their own phone.
function MessageComposer({ summary, plot, buildingName }: { summary: PlotSummary; plot: RentalHistoryPlot; buildingName: string }) {
  const suggested = suggestedMessage(summary);
  const [kind, setKind] = useState<MessageKind | null>(null);
  const [text, setText] = useState("");
  const [phone, setPhone] = useState(plot.phoneNumbers[0] ?? "");
  const [copied, setCopied] = useState(false);

  function open(next: MessageKind) {
    if (kind === next) return setKind(null);
    setKind(next);
    setCopied(false);
    setText(buildPlotMessage(next, { tenantName: plot.currentTenant ?? "", plotNumber: plot.plotNumber, buildingName, summary }));
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  const linkClass = "inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold";

  return (
    <div className="mt-2.5 rounded-lg border border-line p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps">Message tenant</span>
        {MESSAGE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => open(k)}
            aria-pressed={kind === k}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${kind === k ? "border-primary bg-primary text-white" : `border-line-strong bg-white hover:bg-primary-light ${KIND_STYLE[k]}`}`}
          >
            {MESSAGE_LABELS[k]}
            {k === suggested && kind !== k && <span className="rounded-full bg-primary-light px-1.5 text-[11px] font-bold text-ink">suggested</span>}
          </button>
        ))}
      </div>
      {kind && (
        <div className="mt-2.5 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            aria-label={`${MESSAGE_LABELS[kind]} message for plot ${plot.plotNumber}`}
            className="w-full rounded-control border border-line-strong bg-white px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex flex-wrap items-center gap-2">
            {plot.phoneNumbers.length > 1 ? (
              <select value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Send to" className="min-h-10 rounded-control border border-line-strong bg-white px-2 text-base">
                {plot.phoneNumbers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-foreground/60">{phone ? `To ${phone}` : "No phone number saved for this tenant - add one under All details, or copy the message."}</span>
            )}
            {phone && (
              <>
                <a href={`https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={`${linkClass} bg-primary text-white hover:bg-primary-dark`}>
                  Send on WhatsApp
                </a>
                <a href={`sms:${phone.replace(/[^0-9+]/g, "")}?body=${encodeURIComponent(text)}`} className={`${linkClass} border border-line-strong bg-white text-ink hover:bg-primary-light`}>
                  Send as SMS
                </a>
              </>
            )}
            <button type="button" onClick={copy} className={`${linkClass} border border-line-strong bg-white text-ink hover:bg-primary-light`}>
              {copied ? "Copied" : "Copy text"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stay({ stay, onEditMonth, onEditTenant }: { stay: RentalStay; onEditMonth: (m: RentalHistoryMonth) => void; onEditTenant?: () => void }) {
  const current = stay.endMonth === null;
  return (
    <div className="rounded-control border border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl bg-primary-light px-3 py-2.5">
        <div>
          <p className="font-bold text-ink">{stay.tenantName}</p>
          <p className="text-xs text-ink/70">
            Moved in {formatDate(stay.moveInDate)} ·{" "}
            {current ? "Current tenant" : `Moved out ${formatDate(stay.movedOutDate)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-ink">
            {stay.monthsPaid} of {stay.months.length} months paid · {rupees(stay.totalPaid)} received
          </p>
          {onEditTenant && (
            <button type="button" onClick={onEditTenant} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line-strong bg-white px-3 text-xs font-semibold text-ink hover:bg-primary-light">
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
              <th className="label-caps whitespace-nowrap px-3 py-2">Month</th>
              <th className="label-caps whitespace-nowrap px-3 py-2">Status</th>
              <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Due</th>
              <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Paid</th>
              <th className="label-caps whitespace-nowrap px-3 py-2">Paid on</th>
              <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
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
                  {m.status && (m.recorded || m.status === "PAID") && !(m.status === "UNPAID" && tone === "due") ? (
                    <>
                      <StatusBadge status={m.status} />
                      {m.status === "PAID" && m.amountPaid < m.due && (
                        <span className="block text-[11px] text-foreground/45">covered by rent paid ahead</span>
                      )}
                    </>
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
    <div className="rounded-control border border-partial/40 bg-partial-bg/40">
      <div className="px-3 py-2.5">
        <p className="font-bold text-partial">Other records for plot {plot.plotNumber}</p>
        <p className="text-xs text-foreground/60">These months fall outside any tenant&apos;s stay, so they are not counted. Click one to move it to the right month, correct it, or delete it.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <tbody className="divide-y divide-line">
            {plot.otherRecords.map((m) => (
              <tr key={m.month} onClick={() => onEditMonth(m)} title="Click to edit this month" className="cursor-pointer hover:bg-white/60">
                <td className="px-3 py-2 font-medium">{formatMonthLabel(m.month)}</td>
                <td className="px-3 py-2 text-right">Due {rupees(m.due)}</td>
                <td className="px-3 py-2 text-right">Paid {rupees(m.amountPaid)}</td>
                <td className="px-3 py-2">{m.paidDate ? formatDate(m.paidDate) : "—"}</td>
                <td className="px-3 py-2 text-right text-xs font-semibold text-ink">Edit</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
