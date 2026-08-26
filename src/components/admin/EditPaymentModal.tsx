"use client";

import { useState } from "react";
import ModalShell from "./ModalShell";
import StatusBadge from "@/components/StatusBadge";
import { isBeforeMoveInMonth } from "@/lib/month";
import { stripElectricityNote, withElectricityNote } from "@/lib/notes";
import { computeElectricityAmount, computeElectricityUnits } from "@/lib/electricity";
import type { DashboardRow, PaymentStatus } from "@/lib/types";

interface Props {
  row: DashboardRow;
  month: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "text-sm font-medium text-foreground/80";

export default function EditPaymentModal({ row, month, onClose, onSaved }: Props) {
  const [plotNumber, setPlotNumber] = useState(row.unit.plotNumber);
  const [tenantName, setTenantName] = useState(row.unit.tenantName ?? "");
  const [moveInDate, setMoveInDate] = useState(row.unit.moveInDate?.slice(0, 10) ?? "");
  const [advanceAmount, setAdvanceAmount] = useState(String(row.unit.advanceAmount));
  const [rent, setRent] = useState(String(row.payment?.rentAmount ?? row.unit.monthlyRent));
  const [maintenance, setMaintenance] = useState(
    String(row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount)
  );
  const [amountPaid, setAmountPaid] = useState(String(row.payment?.amountPaid ?? 0));
  const [paidDate, setPaidDate] = useState(row.payment?.paidDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(stripElectricityNote(row.payment?.notes));
  const [prevReading, setPrevReading] = useState(String(row.payment?.prevReading ?? 0));
  const [currReading, setCurrReading] = useState(String(row.payment?.currReading ?? 0));
  const [electricityPaid, setElectricityPaid] = useState(row.payment?.electricityPaid ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rentNumber = Number(rent || 0);
  const maintenanceNumber = Number(maintenance || 0);
  const rentSum = rentNumber + maintenanceNumber;
  const paidNumber = Number(amountPaid || 0);
  const balanceDue = Math.max(0, rentSum - paidNumber);
  const excessAmount = Math.max(0, paidNumber - rentSum);
  const status: PaymentStatus = paidNumber <= 0 ? "UNPAID" : paidNumber >= rentSum ? "PAID" : "PARTIAL";
  const isBeforeMoveIn = isBeforeMoveInMonth(moveInDate || null, month);

  const prevReadingNumber = Number(prevReading || 0);
  const currReadingNumber = Number(currReading || 0);
  const readingError = currReadingNumber < prevReadingNumber;
  const electricityUnits = computeElectricityUnits(prevReadingNumber, currReadingNumber);
  const electricityAmount = computeElectricityAmount(prevReadingNumber, currReadingNumber);

  async function save() {
    if (paidNumber > 0 && !paidDate) {
      setError("Enter a paid date when an amount has been paid.");
      return;
    }
    if (readingError) {
      setError("Current meter reading must be greater than or equal to the previous reading.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const unitRes = await fetch(`/api/admin/units/${row.unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plotNumber,
          tenantName: tenantName || null,
          moveInDate: moveInDate || null,
          advanceAmount: Number(advanceAmount || 0),
          monthlyRent: rentNumber,
          maintenanceAmount: maintenanceNumber,
        }),
      });
      const unitJson = await unitRes.json();
      if (!unitRes.ok) throw new Error(unitJson.error ?? "Failed to update plot.");

      const finalNotes = withElectricityNote(notes, excessAmount);

      const paymentRes = await fetch("/api/admin/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: row.unit.id,
          month,
          paymentStatus: status,
          rentAmount: rentNumber,
          maintenanceAmount: maintenanceNumber,
          amountPaid: paidNumber,
          balanceDue,
          paidDate: paidDate || null,
          notes: finalNotes,
          prevReading: prevReadingNumber,
          currReading: currReadingNumber,
          electricityPaid,
        }),
      });
      const paymentJson = await paymentRes.json();
      if (!paymentRes.ok) throw new Error(paymentJson.error ?? "Failed to update payment.");
      onSaved(`Plot ${plotNumber} saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this row.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      titleId="edit-payment-title"
      title={`Edit plot ${row.unit.plotNumber}`}
      subtitle={row.unit.tenantName || "Vacant"}
      onClose={onClose}
      maxWidth="lg"
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-lg border border-unpaid/30 bg-unpaid-bg px-3 py-2 text-sm text-unpaid">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground/45">This month</span>
          <StatusBadge status={isBeforeMoveIn ? "NA" : tenantName.trim() ? status : "VACANT"} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Plot / flat number</span>
            <input required value={plotNumber} onChange={(e) => setPlotNumber(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Tenant name</span>
            <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} className={inputClass} />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Joining date</span>
          <input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} className={inputClass} />
        </label>

        <div className="border-t border-primary/10 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/45">Rent</p>
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
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Advance (₹)</span>
              <input type="number" min="0" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} className={inputClass} />
            </label>
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Rent sum</span>
              <div className="flex min-h-11 items-center rounded-xl bg-primary-light px-3 text-base font-semibold text-primary-dark">
                ₹{rentSum.toFixed(0)}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-primary/10 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/45">Electricity meter</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Prev reading</span>
              <input type="number" min="0" value={prevReading} onChange={(e) => setPrevReading(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Curr reading</span>
              <input
                type="number"
                min="0"
                value={currReading}
                onChange={(e) => setCurrReading(e.target.value)}
                className={`${inputClass} ${readingError ? "border-unpaid focus:border-unpaid focus:ring-unpaid/20" : ""}`}
              />
            </label>
          </div>
          {readingError && <p className="mt-1.5 text-xs font-medium text-unpaid">Current reading must be ≥ previous reading.</p>}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Electricity (₹)</span>
              <div className="flex min-h-11 items-center rounded-xl bg-primary-light px-3 text-base font-semibold text-primary-dark">
                ₹{electricityAmount.toFixed(0)}
                <span className="ml-1.5 text-sm font-normal text-primary-dark/60">({electricityUnits} units)</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Elec. status</span>
              <div className="flex min-h-11 overflow-hidden rounded-xl border border-primary/25">
                <button
                  type="button"
                  onClick={() => setElectricityPaid(true)}
                  className={`flex-1 text-sm font-semibold transition-colors ${
                    electricityPaid ? "bg-paid text-white" : "bg-white text-foreground/60 hover:bg-paid-bg"
                  }`}
                >
                  Paid
                </button>
                <button
                  type="button"
                  onClick={() => setElectricityPaid(false)}
                  className={`flex-1 text-sm font-semibold transition-colors ${
                    !electricityPaid ? "bg-unpaid text-white" : "bg-white text-foreground/60 hover:bg-unpaid-bg"
                  }`}
                >
                  Unpaid
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-primary/10 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/45">Payment</p>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Amount paid (₹)</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => {
                  setAmountPaid(String(rentSum));
                  if (!paidDate) setPaidDate(new Date().toISOString().slice(0, 10));
                }}
                title="Fill full rent sum as paid"
                className="min-h-11 shrink-0 whitespace-nowrap rounded-xl border border-paid/40 bg-paid-bg px-3 text-sm font-semibold text-paid hover:bg-paid/20"
              >
                Full
              </button>
            </div>
            {excessAmount > 0 && (
              <p className="text-xs font-medium text-partial">
                ₹{excessAmount.toFixed(0)} over rent — will be logged in notes as &quot;Paid Electricity&quot;.
              </p>
            )}
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Paid date</span>
              <input
                type="date"
                required={paidNumber > 0}
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Balance due</span>
              <div
                className={`flex min-h-11 items-center rounded-xl px-3 text-base font-semibold ${
                  balanceDue > 0 ? "bg-unpaid-bg text-unpaid" : "bg-paid-bg text-paid"
                }`}
              >
                ₹{balanceDue.toFixed(0)}
              </div>
            </div>
          </div>
          <label className="mt-3 flex flex-col gap-1">
            <span className={labelClass}>Notes</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={excessAmount > 0 ? "Other notes (optional)" : undefined}
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex gap-3 border-t border-primary/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 flex-1 rounded-xl border border-primary/20 px-4 py-2.5 text-base font-semibold text-foreground/70 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || readingError}
            className="min-h-11 flex-1 rounded-xl bg-primary px-4 py-2.5 text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
