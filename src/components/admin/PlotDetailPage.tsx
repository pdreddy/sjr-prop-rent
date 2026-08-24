"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentMonth, formatMonthLabel } from "@/lib/month";
import { setFlashMessage } from "@/lib/flash";
import type { DashboardResponse, DashboardRow, PaymentStatus } from "@/lib/types";
import { IconArrowLeft, IconTrash } from "@/components/icons";

const inputClass =
  "min-h-11 w-full rounded-xl border border-primary/20 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "text-sm font-medium text-foreground/80";
const sectionClass = "flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm";
const legendClass = "text-xs font-semibold uppercase tracking-wide text-primary-dark/70";

export default function PlotDetailPage({
  plotId,
  initialMonth,
}: {
  plotId: string;
  initialMonth?: string;
}) {
  const router = useRouter();
  const isNew = plotId === "new";
  const month = initialMonth ?? getCurrentMonth();

  const [row, setRow] = useState<DashboardRow | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/admin/dashboard?month=${encodeURIComponent(month)}&status=ALL`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          router.push("/admin/login");
          return;
        }
        if (!res.ok) throw new Error("Failed to load plot.");
        const json: DashboardResponse = await res.json();
        const found = json.rows.find((r) => r.unit.id === plotId) ?? null;
        if (cancelled) return;
        if (!found) {
          setLoadError("Plot not found.");
        } else {
          setRow(found);
        }
      } catch {
        if (!cancelled) setLoadError("Could not load this plot. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, month, plotId, router]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3" aria-busy="true">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-primary-light" />
          <div className="h-64 animate-pulse rounded-2xl bg-primary-light" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <BackLink month={month} />
        <div className="mt-4 rounded-2xl border border-unpaid/30 bg-unpaid-bg p-4 text-unpaid">
          {loadError}
        </div>
      </div>
    );
  }

  return <PlotForm row={row} month={month} isNew={isNew} />;
}

function BackLink({ month }: { month: string }) {
  return (
    <Link
      href={`/admin?month=${encodeURIComponent(month)}`}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      <IconArrowLeft className="h-3.5 w-3.5" />
      Back to plots
    </Link>
  );
}

function PlotForm({ row, month, isNew }: { row: DashboardRow | null; month: string; isNew: boolean }) {
  const router = useRouter();

  const [plotNumber, setPlotNumber] = useState(row?.unit.plotNumber ?? "");
  const [tenantName, setTenantName] = useState(row?.unit.tenantName ?? "");
  const [moveInDate, setMoveInDate] = useState(
    row?.unit.moveInDate ? row.unit.moveInDate.slice(0, 10) : ""
  );
  const [phone, setPhone] = useState(row?.unit.phone ?? "");
  const [advanceAmount, setAdvanceAmount] = useState(row ? String(row.unit.advanceAmount) : "0");
  const [monthlyRent, setMonthlyRent] = useState(row ? String(row.unit.monthlyRent) : "0");
  const [defaultMaintenance, setDefaultMaintenance] = useState(
    row ? String(row.unit.maintenanceAmount) : "0"
  );

  const defaultRent = row?.payment?.rentAmount ?? row?.unit.monthlyRent ?? 0;
  const defaultPaymentMaintenance = row?.payment?.maintenanceAmount ?? row?.unit.maintenanceAmount ?? 0;
  const [rentAmount, setRentAmount] = useState(String(defaultRent));
  const [maintenanceAmount, setMaintenanceAmount] = useState(String(defaultPaymentMaintenance));
  const [amountPaid, setAmountPaid] = useState(String(row?.payment?.amountPaid ?? 0));
  const [paidDate, setPaidDate] = useState(row?.payment?.paidDate ? row.payment.paidDate.slice(0, 10) : "");
  const [notes, setNotes] = useState(row?.payment?.notes ?? "");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const rentSum = Number(rentAmount || 0) + Number(maintenanceAmount || 0);
  const paidNumber = Number(amountPaid || 0);
  const balanceDue = Math.max(0, rentSum - paidNumber);
  const paymentStatus: PaymentStatus = paidNumber <= 0 ? "UNPAID" : paidNumber >= rentSum ? "PAID" : "PARTIAL";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (paidNumber > 0 && !paidDate) {
      setError("Enter a paid date when an amount has been paid.");
      return;
    }
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

      setFlashMessage(`Plot ${plotNumber} saved.`);
      router.push(`/admin?month=${encodeURIComponent(month)}`);
      router.refresh();
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
    try {
      const res = await fetch(`/api/admin/units/${row.unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      if (res.ok) {
        setFlashMessage(`Plot ${row.unit.plotNumber} deactivated.`);
        router.push(`/admin?month=${encodeURIComponent(month)}`);
        router.refresh();
      } else {
        setError("Failed to deactivate this plot.");
      }
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <BackLink month={month} />
        {!isNew && (
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={deactivating}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-unpaid/30 px-3 py-1.5 text-sm font-medium text-unpaid hover:bg-unpaid-bg disabled:opacity-60"
          >
            <IconTrash className="h-3.5 w-3.5" />
            {deactivating ? "Deactivating…" : "Deactivate"}
          </button>
        )}
      </div>

      <h1 className="mb-1 text-xl font-bold text-primary-dark">
        {isNew ? "Add plot" : `Plot ${row!.unit.plotNumber}`}
      </h1>
      <p className="mb-5 text-sm text-foreground/50">
        {isNew ? "Create a new plot record" : row!.unit.tenantName || "Vacant"}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-lg border border-unpaid/30 bg-unpaid-bg px-3 py-2 text-sm text-unpaid">
            {error}
          </div>
        )}

        <fieldset className={sectionClass}>
          <legend className={legendClass}>Tenant details</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <span className={labelClass}>Phone number</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputClass} />
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
          <p className="text-xs text-foreground/45">Used as the default when a month doesn&apos;t have its own rent entered yet.</p>
        </fieldset>

        <fieldset className={sectionClass}>
          <legend className={legendClass}>Payment — {formatMonthLabel(month)}</legend>

          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              {(["PAID", "PARTIAL", "UNPAID"] as PaymentStatus[]).map((s) => (
                <span
                  key={s}
                  className={`flex-1 rounded-lg border px-2 py-2 text-center text-sm font-semibold ${
                    paymentStatus === s
                      ? s === "PAID"
                        ? "border-paid bg-paid-bg text-paid"
                        : s === "PARTIAL"
                        ? "border-partial bg-partial-bg text-partial"
                        : "border-unpaid bg-unpaid-bg text-unpaid"
                      : "border-primary/10 bg-white text-foreground/30"
                  }`}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </span>
              ))}
            </div>
            <span className="text-xs text-foreground/45">Status is set automatically from the amount paid.</span>
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
            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={inputClass} />
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

        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-primary/10 bg-white p-4 sm:sticky sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
          <div className="mx-auto flex max-w-2xl gap-3">
            <Link
              href={`/admin?month=${encodeURIComponent(month)}`}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-primary/20 px-4 py-2.5 text-base font-semibold text-foreground/70"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-11 flex-1 rounded-xl bg-primary px-4 py-2.5 text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
