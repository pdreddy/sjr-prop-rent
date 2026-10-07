"use client";

import { useState } from "react";
import ModalShell from "./ModalShell";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { formatMonthLabel, getCurrentMonth, getNextMonth } from "@/lib/month";
import { monthsBetween } from "@/lib/electricityLedger";
import { moveInProration, prorate } from "@/lib/proration";
import type { RentalHistoryMonth, RentalHistoryPlot } from "@/lib/types";

const inputClass =
  "min-h-11 w-full rounded-xl border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "text-sm font-medium text-foreground/80";
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

interface Props {
  plot: RentalHistoryPlot;
  /** Move-in date of the stay this month belongs to (drives the part-month calculation). */
  moveInDate: string | null;
  tenantName: string;
  month: RentalHistoryMonth;
  onClose: () => void;
  onSaved: (message: string) => void;
}

// Edits one month's record in full: what was due, what was paid and when, notes, meter readings -
// and the month itself, so a record filed under the wrong month can be moved to the right one.
export default function HistoryMonthEditModal({ plot, moveInDate, tenantName, month: record, onClose, onSaved }: Props) {
  const isNew = !record.recorded;
  const [month, setMonth] = useState(record.month);
  const [rent, setRent] = useState(String(record.rentAmount));
  const [maintenance, setMaintenance] = useState(String(record.maintenanceAmount));
  const [amountPaid, setAmountPaid] = useState(String(record.amountPaid));
  const [paidDate, setPaidDate] = useState(record.paidDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [prevReading, setPrevReading] = useState(String(record.prevReading));
  const [currReading, setCurrReading] = useState(String(record.currReading));
  const [electricityPaid, setElectricityPaid] = useState(record.electricityPaid);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rentN = Number(rent || 0);
  const maintN = Number(maintenance || 0);
  const paidN = Number(amountPaid || 0);
  const prevN = Number(prevReading || 0);
  const currN = Number(currReading || 0);
  const due = rentN + maintN;
  const balance = Math.max(0, due - paidN);
  const status = paidN <= 0 ? "UNPAID" : paidN >= due ? "PAID" : "PARTIAL";
  const readingError = currN !== 0 && currN < prevN;

  // Months a record can be moved to: from the building's opening through next month, plus this record's own.
  const options = Array.from(new Set([...monthsBetween(BUILDING_READY_MONTH, getNextMonth(getCurrentMonth())), record.month])).sort();

  const proration = moveInProration(moveInDate, month);
  function useAgreedRent() {
    setRent(String(prorate(plot.monthlyRent, proration)));
    setMaintenance(String(prorate(plot.maintenanceAmount, proration)));
  }

  async function save() {
    if (paidN > 0 && !paidDate) return setError("Enter the date the rent was paid.");
    if (readingError) return setError("Current meter reading must be at least the previous reading (or 0 if not read yet).");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: plot.unitId,
          month,
          originalMonth: !isNew && month !== record.month ? record.month : undefined,
          paymentStatus: status,
          rentAmount: rentN,
          maintenanceAmount: maintN,
          amountPaid: paidN,
          balanceDue: balance,
          paidDate: paidDate || null,
          notes: notes.trim() || null,
          prevReading: prevN,
          currReading: currN,
          electricityPaid,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save this month.");
      onSaved(!isNew && month !== record.month ? `Moved the record from ${formatMonthLabel(record.month)} to ${formatMonthLabel(month)}.` : `Saved ${formatMonthLabel(month)} for plot ${plot.plotNumber}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this month.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the ${formatMonthLabel(record.month)} record for plot ${plot.plotNumber}? This removes its rent, payment and meter details.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments?unitId=${encodeURIComponent(plot.unitId)}&month=${record.month}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not delete this record.");
      onSaved(`Deleted the ${formatMonthLabel(record.month)} record for plot ${plot.plotNumber}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      titleId="history-month-title"
      title={`${isNew ? "Add" : "Edit"} ${formatMonthLabel(record.month)}`}
      subtitle={`Plot ${plot.plotNumber} · ${tenantName}`}
      onClose={onClose}
      maxWidth="lg"
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-lg border border-unpaid/30 bg-unpaid-bg px-3 py-2 text-sm text-unpaid">
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Month this record belongs to</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass}>
            {options.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
          {!isNew && month !== record.month && (
            <span className="text-xs text-partial">
              This moves the whole record from {formatMonthLabel(record.month)} to {formatMonthLabel(month)}. The target month must not already have a record.
            </span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Rent (₹)</span>
            <input type="number" min="0" value={rent} onChange={(e) => setRent(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Maintenance (₹)</span>
            <input type="number" min="0" value={maintenance} onChange={(e) => setMaintenance(e.target.value)} className={inputClass} />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/55">
          <span>
            Due this month <b className="text-foreground">{rupees(due)}</b>
            {proration.prorated ? ` · part month: ${proration.days}/30 days` : ""}
          </span>
          <button type="button" onClick={useAgreedRent} className="rounded-full border border-primary/25 px-3 py-1 font-semibold text-primary-dark hover:bg-primary-light">
            Use agreed rent{proration.prorated ? " (prorated)" : ""}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Amount paid (₹)</span>
            <input type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Date paid</span>
            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={inputClass} />
          </label>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-primary-light px-3 py-2 text-sm">
          <span className="text-foreground/65">
            Status <b className="text-foreground">{status}</b>
          </span>
          <span className={balance > 0 ? "font-bold text-unpaid" : "font-bold text-paid"}>Balance {rupees(balance)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Previous meter reading</span>
            <input type="number" min="0" step="any" value={prevReading} onChange={(e) => setPrevReading(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Current meter reading</span>
            <input type="number" min="0" step="any" value={currReading} onChange={(e) => setCurrReading(e.target.value)} className={inputClass} />
          </label>
        </div>
        <p className="-mt-2 text-xs text-foreground/55">Leave the current reading at 0 if the meter was not read: the default bill applies.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={electricityPaid} onChange={(e) => setElectricityPaid(e.target.checked)} className="h-4 w-4" />
          Electricity bill marked paid
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} min-h-0`} />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-primary/10 pt-3">
          {!isNew ? (
            <button type="button" onClick={remove} disabled={saving} className="min-h-10 rounded-xl border border-unpaid/40 px-4 text-sm font-semibold text-unpaid hover:bg-unpaid-bg disabled:opacity-60">
              Delete record
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-xl border border-primary/25 px-4 text-sm font-semibold text-foreground/70 hover:bg-primary-light disabled:opacity-60">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} className="min-h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
