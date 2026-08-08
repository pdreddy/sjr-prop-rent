"use client";

import { useState, type FormEvent } from "react";
import type { DashboardRow, PaymentStatus } from "@/lib/types";
import { formatMonthLabel } from "@/lib/month";
import ModalShell from "./ModalShell";

interface Props {
  row: DashboardRow | null; // null = creating a new plot
  month: string;
  onClose: () => void;
  onSaved: () => void;
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "text-sm font-medium text-foreground/80";
const sectionClass = "flex flex-col gap-3 rounded-2xl bg-primary-light/40 p-4";
const legendClass = "text-xs font-semibold uppercase tracking-wide text-primary-dark/70";

export default function UnitEditorModal({ row, month, onClose, onSaved }: Props) {
  const isNew = row === null;
  const [plotNumber, setPlotNumber] = useState(row?.unit.plotNumber ?? "");
  const [tenantName, setTenantName] = useState(row?.unit.tenantName ?? "");
  const [moveInDate, setMoveInDate] = useState(
    row?.unit.moveInDate ? row.unit.moveInDate.slice(0, 10) : ""
  );
  const [phone, setPhone] = useState(row?.unit.phone ?? "");
  const [advanceAmount, setAdvanceAmount] = useState(
    row ? String(row.unit.advanceAmount) : "0"
  );
  const [monthlyRent, setMonthlyRent] = useState(
    row ? String(row.unit.monthlyRent) : "0"
  );
  const [defaultMaintenance, setDefaultMaintenance] = useState(
    row ? String(row.unit.maintenanceAmount) : "0"
  );

  const defaultRent = row?.payment?.rentAmount ?? row?.unit.monthlyRent ?? 0;
  const defaultPaymentMaintenance =
    row?.payment?.maintenanceAmount ?? row?.unit.maintenanceAmount ?? 0;
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    row?.payment?.paymentStatus ?? "UNPAID"
  );
  const [rentAmount, setRentAmount] = useState(String(defaultRent));
  const [maintenanceAmount, setMaintenanceAmount] = useState(String(defaultPaymentMaintenance));
  const [amountPaid, setAmountPaid] = useState(String(row?.payment?.amountPaid ?? 0));
  const [paidDate, setPaidDate] = useState(
    row?.payment?.paidDate ? row.payment.paidDate.slice(0, 10) : ""
  );
  const [notes, setNotes] = useState(row?.payment?.notes ?? "");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const rentSum = Number(rentAmount || 0) + Number(maintenanceAmount || 0);
  const balanceDue = Math.max(0, rentSum - Number(amountPaid || 0));

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
            moveInDate: moveInDate || null,
            phone: phone || null,
            advanceAmount: Number(advanceAmount),
            monthlyRent: Number(monthlyRent),
            maintenanceAmount: Number(defaultMaintenance),
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
            moveInDate: moveInDate || null,
            phone: phone || null,
            advanceAmount: Number(advanceAmount),
            monthlyRent: Number(monthlyRent),
            maintenanceAmount: Number(defaultMaintenance),
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
          maintenanceAmount: Number(maintenanceAmount),
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
    <ModalShell
      titleId="editor-title"
      title={isNew ? "Add plot" : `Edit plot ${row!.unit.plotNumber}`}
      subtitle={isNew ? "Create a new plot record" : "Full tenant record"}
      onClose={onClose}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-lg border border-unpaid/30 bg-unpaid-bg px-3 py-2 text-sm text-unpaid">
            {error}
          </div>
        )}

        <fieldset className={sectionClass}>
          <legend className={legendClass}>Tenant details</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <span className={labelClass}>Plot / flat number</span>
              <input
                required
                value={plotNumber}
                onChange={(e) => setPlotNumber(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <span className={labelClass}>
                Tenant name <span className="font-normal text-foreground/40">(public)</span>
              </span>
              <input
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Leave blank if vacant"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>
                Move-in date <span className="font-normal text-foreground/40">(public)</span>
              </span>
              <input
                type="date"
                value={moveInDate}
                onChange={(e) => setMoveInDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Phone number</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Advance amount (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={sectionClass}>
          <legend className={legendClass}>Default rent</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Monthly rent (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Maintenance (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={defaultMaintenance}
                onChange={(e) => setDefaultMaintenance(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <p className="text-xs text-foreground/45">
            Used as the default when a month doesn&apos;t have its own rent entered yet.
          </p>
        </fieldset>

        <fieldset className={sectionClass}>
          <legend className={legendClass}>Payment — {formatMonthLabel(month)}</legend>

          <div className="flex gap-2">
            {(["PAID", "PARTIAL", "UNPAID"] as PaymentStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPaymentStatus(s)}
                className={`min-h-10 flex-1 rounded-lg border px-2 py-2 text-sm font-semibold transition-colors ${
                  paymentStatus === s
                    ? s === "PAID"
                      ? "border-paid bg-paid-bg text-paid"
                      : s === "PARTIAL"
                      ? "border-partial bg-partial-bg text-partial"
                      : "border-unpaid bg-unpaid-bg text-unpaid"
                    : "border-primary/15 bg-white text-foreground/60"
                }`}
              >
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Rent this month (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Maintenance this month (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={maintenanceAmount}
                onChange={(e) => setMaintenanceAmount(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <p className="text-sm text-foreground/60">
            Rent sum: <span className="font-semibold text-foreground">₹{rentSum.toFixed(2)}</span>
          </p>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Amount paid (₹)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className={inputClass}
            />
          </label>

          <p className="text-sm text-foreground/60">
            Balance due: <span className="font-semibold text-foreground">₹{balanceDue.toFixed(2)}</span>
          </p>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Payment date</span>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Internal notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded-xl border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
        </fieldset>

        <div className="sticky bottom-0 -mx-5 -mb-4 flex gap-3 border-t border-primary/10 bg-white p-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl border border-primary/20 px-4 py-2.5 text-base font-semibold text-foreground/70"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="min-h-11 flex-1 rounded-xl bg-primary px-4 py-2.5 text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
