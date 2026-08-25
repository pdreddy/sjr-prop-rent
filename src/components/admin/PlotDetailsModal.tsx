"use client";

import { useState, type FormEvent } from "react";
import type { DashboardRow } from "@/lib/types";
import ModalShell from "./ModalShell";
import { IconTrash } from "@/components/icons";

interface Props {
  row: DashboardRow | null; // null = creating a new plot
  onClose: () => void;
  onSaved: (message: string) => void;
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "text-sm font-medium text-foreground/80";

export default function PlotDetailsModal({ row, onClose, onSaved }: Props) {
  const isNew = row === null;
  const [plotNumber, setPlotNumber] = useState(row?.unit.plotNumber ?? "");
  const [tenantName, setTenantName] = useState(row?.unit.tenantName ?? "");
  const [moveInDate, setMoveInDate] = useState(
    row?.unit.moveInDate ? row.unit.moveInDate.slice(0, 10) : ""
  );
  const [phone, setPhone] = useState(row?.unit.phone ?? "");
  const [advanceAmount, setAdvanceAmount] = useState(row ? String(row.unit.advanceAmount) : "0");
  const [monthlyRent, setMonthlyRent] = useState(row ? String(row.unit.monthlyRent) : "0");
  const [maintenanceAmount, setMaintenanceAmount] = useState(
    row ? String(row.unit.maintenanceAmount) : "0"
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = JSON.stringify({
        plotNumber,
        tenantName: tenantName || null,
        moveInDate: moveInDate || null,
        phone: phone || null,
        advanceAmount: Number(advanceAmount),
        monthlyRent: Number(monthlyRent),
        maintenanceAmount: Number(maintenanceAmount),
      });

      const res = isNew
        ? await fetch("/api/admin/units", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await fetch(`/api/admin/units/${row!.unit.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
          });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save plot.");
        return;
      }

      onSaved(isNew ? `Plot ${plotNumber} added.` : `Plot ${plotNumber} saved.`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate() {
    if (!row) return;
    if (!confirm(`Deactivate Plot ${row.unit.plotNumber}? It will stop appearing in listings.`)) return;
    setDeactivating(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/units/${row.unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      if (res.ok) {
        onSaved(`Plot ${row.unit.plotNumber} deactivated.`);
      } else {
        setError("Failed to deactivate this plot.");
      }
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <ModalShell
      titleId="plot-details-title"
      title={isNew ? "Add plot" : `Plot ${row!.unit.plotNumber}`}
      subtitle={isNew ? "Create a new plot record" : row!.unit.tenantName || "Vacant"}
      onClose={onClose}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-lg border border-unpaid/30 bg-unpaid-bg px-3 py-2 text-sm text-unpaid">
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Plot / flat number</span>
          <input required value={plotNumber} onChange={(e) => setPlotNumber(e.target.value)} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1">
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
          <input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} className={inputClass} />
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

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Default monthly rent (₹)</span>
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
            <span className={labelClass}>Default maintenance (₹)</span>
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
        <p className="-mt-2 text-xs text-foreground/45">
          Used as the rent for a month until it&apos;s marked paid for that month in the table.
        </p>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Phone number</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputClass} />
        </label>

        <div className="flex gap-3 border-t border-primary/10 pt-4">
          {!isNew && (
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={deactivating || submitting}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-unpaid/30 px-3.5 py-2.5 text-sm font-medium text-unpaid hover:bg-unpaid-bg disabled:opacity-60"
            >
              <IconTrash className="h-4 w-4" />
              {deactivating ? "Deactivating…" : "Deactivate"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl border border-primary/20 px-4 py-2.5 text-base font-semibold text-foreground/70"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || deactivating}
            className="min-h-11 flex-1 rounded-xl bg-primary px-4 py-2.5 text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
