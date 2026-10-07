"use client";

import { useState } from "react";
import ModalShell from "./ModalShell";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { formatMonthLabel } from "@/lib/month";
import type { RentalHistoryPlot } from "@/lib/types";

const inputClass =
  "min-h-11 w-full rounded-xl border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "text-sm font-medium text-foreground/80";

// Edits the current tenant's move-in date and the plot's agreed rent. A changed move-in date also fills
// in / re-prices that plot's months so the rest of the app lines up with it straight away.
export default function HistoryTenantEditModal({ plot, onClose, onSaved }: { plot: RentalHistoryPlot; onClose: () => void; onSaved: (message: string) => void }) {
  const [moveInDate, setMoveInDate] = useState(plot.moveInDate?.slice(0, 10) ?? "");
  const [monthlyRent, setMonthlyRent] = useState(String(plot.monthlyRent));
  const [maintenance, setMaintenance] = useState(String(plot.maintenanceAmount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/units/${plot.unitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moveInDate: moveInDate || null, monthlyRent: Number(monthlyRent || 0), maintenanceAmount: Number(maintenance || 0) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");

      let extra = "";
      if (moveInDate && moveInDate !== plot.moveInDate?.slice(0, 10)) {
        const fill = await fetch("/api/admin/backfill-months", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dryRun: false, unitId: plot.unitId }),
        });
        const filled = await fill.json().catch(() => null);
        if (fill.ok && filled) {
          extra = ` ${filled.created} month(s) filled in, ${filled.adjusted} re-priced.`;
          // A first month that already has a payment at the full rent is never changed automatically.
          if (filled.needsReview > 0) extra += ` ${filled.needsReview} month(s) already paid at the full rent - click that month and use "Use agreed rent (prorated)" if it should be a part month.`;
        }
      }
      onSaved(`Saved plot ${plot.plotNumber}.${extra}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell titleId="history-tenant-title" title={`Edit tenant details`} subtitle={`Plot ${plot.plotNumber} · ${plot.currentTenant ?? "Vacant"}`} onClose={onClose} maxWidth="md">
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-lg border border-unpaid/30 bg-unpaid-bg px-3 py-2 text-sm text-unpaid">
            {error}
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Move-in date</span>
          <input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} className={inputClass} />
          <span className="text-xs text-foreground/55">
            Rent starts the month after move-in (part month prorated). The building opened {formatMonthLabel(BUILDING_READY_MONTH)}; earlier dates are rejected.
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Agreed monthly rent (₹)</span>
            <input type="number" min="0" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Maintenance (₹)</span>
            <input type="number" min="0" value={maintenance} onChange={(e) => setMaintenance(e.target.value)} className={inputClass} />
          </label>
        </div>
        <p className="text-xs text-foreground/55">
          The agreed rent applies to months from now on. Months already recorded keep the rent saved for them; click a month in the history to change that month&apos;s rent.
          To rename the tenant, use the plot&apos;s info button on the Overview tab.
        </p>
        <div className="flex justify-end gap-2 border-t border-primary/10 pt-3">
          <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-xl border border-primary/25 px-4 text-sm font-semibold text-foreground/70 hover:bg-primary-light disabled:opacity-60">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} className="min-h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
