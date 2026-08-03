"use client";

import { useState, type FormEvent } from "react";
import type { DashboardRow, PaymentStatus } from "@/lib/types";
import { formatMonthLabel } from "@/lib/month";

interface Props {
  row: DashboardRow;
  month: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function RentUpdateModal({ row, month, onClose, onSaved }: Props) {
  const [rentAmount, setRentAmount] = useState(
    String(row.payment?.rentAmount ?? row.unit.monthlyRent)
  );
  const [maintenanceAmount, setMaintenanceAmount] = useState(
    String(row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount)
  );
  const [amountPaid, setAmountPaid] = useState(String(row.payment?.amountPaid ?? 0));
  const [paidDate, setPaidDate] = useState(
    row.payment?.paidDate ? row.payment.paidDate.slice(0, 10) : ""
  );
  const [notes, setNotes] = useState(row.payment?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const rentSum = Number(rentAmount || 0) + Number(maintenanceAmount || 0);
  const paidNumber = Number(amountPaid || 0);
  const balanceDue = Math.max(0, rentSum - paidNumber);
  const status: PaymentStatus = paidNumber <= 0 ? "UNPAID" : paidNumber >= rentSum ? "PAID" : "PARTIAL";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (paidNumber > 0 && !paidDate) {
      setError("Enter a paid date when an amount has been paid.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: row.unit.id,
          month,
          paymentStatus: status,
          rentAmount: Number(rentAmount),
          maintenanceAmount: Number(maintenanceAmount),
          amountPaid: paidNumber,
          balanceDue,
          paidDate: paidDate || null,
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to update rent.");
        return;
      }
      onSaved();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rent-editor-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 id="rent-editor-title" className="text-lg font-bold text-primary-dark">
            Plot {row.unit.plotNumber} — {formatMonthLabel(month)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-foreground/50 hover:bg-foreground/5"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-foreground/60">{row.unit.tenantName || "Vacant"}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div role="alert" className="rounded-lg border border-unpaid/30 bg-unpaid-bg px-3 py-2 text-sm text-unpaid">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground/80">Status</span>
            <div className="flex gap-2">
              {(["PAID", "PARTIAL", "UNPAID"] as PaymentStatus[]).map((s) => (
                <span
                  key={s}
                  className={`flex-1 rounded-lg border px-2 py-2 text-center text-sm font-semibold ${
                    status === s
                      ? s === "PAID"
                        ? "border-paid bg-paid-bg text-paid"
                        : s === "PARTIAL"
                        ? "border-partial bg-partial-bg text-partial"
                        : "border-unpaid bg-unpaid-bg text-unpaid"
                      : "border-primary/10 text-foreground/30"
                  }`}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </span>
              ))}
            </div>
            <span className="text-xs text-foreground/40">Status is set automatically from the amount paid.</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground/80">Rent (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
                className="min-h-11 rounded-lg border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground/80">Maintenance (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={maintenanceAmount}
                onChange={(e) => setMaintenanceAmount(e.target.value)}
                className="min-h-11 rounded-lg border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </div>

          <p className="text-sm text-foreground/60">
            Rent sum: <span className="font-semibold text-foreground">₹{rentSum.toFixed(2)}</span>
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground/80">Amount paid (₹)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="min-h-11 rounded-lg border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <p className="text-sm text-foreground/60">
            Balance due: <span className="font-semibold text-foreground">₹{balanceDue.toFixed(2)}</span>
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground/80">Paid date</span>
            <input
              type="date"
              required={paidNumber > 0}
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="min-h-11 rounded-lg border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground/80">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded-lg border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <div className="sticky bottom-0 -mx-5 -mb-5 flex gap-3 border-t border-primary/10 bg-white p-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-lg border border-primary/20 px-4 py-2.5 text-base font-semibold text-foreground/70"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2.5 text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
