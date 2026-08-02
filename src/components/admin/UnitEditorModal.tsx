"use client";

import { useState, type FormEvent } from "react";
import type { DashboardRow, PaymentStatus } from "@/lib/types";
import { formatMonthLabel } from "@/lib/month";

interface Props {
  row: DashboardRow | null; // null = creating a new plot
  month: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function UnitEditorModal({ row, month, onClose, onSaved }: Props) {
  const isNew = row === null;
  const [plotNumber, setPlotNumber] = useState(row?.unit.plotNumber ?? "");
  const [tenantName, setTenantName] = useState(row?.unit.tenantName ?? "");
  const [phone, setPhone] = useState(row?.unit.phone ?? "");
  const [monthlyRent, setMonthlyRent] = useState(
    row ? String(row.unit.monthlyRent) : "0"
  );

  const defaultRent = row?.payment?.rentAmount ?? row?.unit.monthlyRent ?? 0;
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    row?.payment?.paymentStatus ?? "UNPAID"
  );
  const [rentAmount, setRentAmount] = useState(String(defaultRent));
  const [amountPaid, setAmountPaid] = useState(String(row?.payment?.amountPaid ?? 0));
  const [paidDate, setPaidDate] = useState(
    row?.payment?.paidDate ? row.payment.paidDate.slice(0, 10) : ""
  );
  const [notes, setNotes] = useState(row?.payment?.notes ?? "");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const balanceDue = Math.max(0, Number(rentAmount || 0) - Number(amountPaid || 0));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      let unitId = row?.unit.id;

      if (isNew) {
        const res = await fetch("/api/admin/units", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plotNumber,
            tenantName: tenantName || null,
            phone: phone || null,
            monthlyRent: Number(monthlyRent),
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Failed to create plot.");
          return;
        }
        unitId = json.unit.id;
      } else {
        const res = await fetch(`/api/admin/units/${row!.unit.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plotNumber,
            tenantName: tenantName || null,
            phone: phone || null,
            monthlyRent: Number(monthlyRent),
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Failed to update plot.");
          return;
        }
      }

      const paymentRes = await fetch("/api/admin/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          month,
          paymentStatus,
          rentAmount: Number(rentAmount),
          amountPaid: Number(amountPaid),
          balanceDue,
          paidDate: paidDate || null,
          notes: notes || null,
        }),
      });
      const paymentJson = await paymentRes.json();
      if (!paymentRes.ok) {
        setError(paymentJson.error ?? "Failed to save payment.");
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
      aria-labelledby="editor-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="editor-title" className="text-lg font-bold text-primary-dark">
            {isNew ? "Add Plot" : `Plot ${row!.unit.plotNumber}`}
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div role="alert" className="rounded-lg border border-unpaid/30 bg-unpaid-bg px-3 py-2 text-sm text-unpaid">
              {error}
            </div>
          )}

          <fieldset className="flex flex-col gap-3 rounded-xl border border-primary/10 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-foreground/50">
              Plot details
            </legend>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground/80">Plot / flat number</span>
              <input
                required
                value={plotNumber}
                onChange={(e) => setPlotNumber(e.target.value)}
                className="min-h-11 rounded-lg border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground/80">Tenant name</span>
              <input
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Leave blank if vacant"
                className="min-h-11 rounded-lg border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground/80">Phone number</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className="min-h-11 rounded-lg border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground/80">Monthly rent (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                className="min-h-11 rounded-lg border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-xl border border-primary/10 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-foreground/50">
              Payment — {formatMonthLabel(month)}
            </legend>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground/80">Status</span>
              <div className="flex gap-2">
                {(["PAID", "PARTIAL", "UNPAID"] as PaymentStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPaymentStatus(s)}
                    className={`min-h-11 flex-1 rounded-lg border px-2 py-2 text-sm font-semibold transition-colors ${
                      paymentStatus === s
                        ? s === "PAID"
                          ? "border-paid bg-paid-bg text-paid"
                          : s === "PARTIAL"
                          ? "border-partial bg-partial-bg text-partial"
                          : "border-unpaid bg-unpaid-bg text-unpaid"
                        : "border-primary/15 text-foreground/60"
                    }`}
                  >
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground/80">Rent for this month (₹)</span>
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
              <span className="text-sm font-medium text-foreground/80">Payment date</span>
              <input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="min-h-11 rounded-lg border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground/80">Internal notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="rounded-lg border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </fieldset>

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
