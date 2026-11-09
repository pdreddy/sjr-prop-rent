"use client";

import { shortMonth } from "@/lib/format";
import { Toolbar, Tile, EmptyState } from "./ui";
import { useEffect, useMemo, useState } from "react";
import { formatDate, formatMonthLabel, isBeforeBuildingOpened } from "@/lib/month";
import type { RentPaidResponse } from "@/lib/types";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function RentPaidView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<RentPaidResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/rent-paid", { cache: "no-store" });
        if (res.status === 401) return onUnauthorized();
        if (!res.ok) throw new Error("Failed to load");
        const json: RentPaidResponse = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not load rent paid. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onUnauthorized]);

  const tenants = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.tenants ?? []).filter((t) => !needle || t.plotNumber.toLowerCase().includes(needle) || t.tenantName.toLowerCase().includes(needle));
  }, [data, search]);
  const totals = useMemo(
    () => ({ due: tenants.reduce((s, t) => s + t.totalDue, 0), paid: tenants.reduce((s, t) => s + t.totalPaid, 0), overRent: tenants.reduce((s, t) => s + t.overRent, 0), balance: tenants.reduce((s, t) => s + t.balance, 0) }),
    [tenants]
  );

  if (error) return <div className="rounded-control border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">{error}</div>;
  if (!data) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-control bg-primary-light" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        title="Rent paid"
        subtitle={`Rent due and received per tenant, to ${formatMonthLabel(data.currentMonth)}`}
        search={{ value: search, onChange: setSearch }}
        help={
          <>
            Rent starts the month after move-in: the first record pays the move-in month (prorated if they didn&apos;t move in on the
            1st), then full rent every month through {formatMonthLabel(data.currentMonth)}. A month with no record counts as unpaid. Everything paid counts as rent; only a small
            excess over the month&apos;s rent (under ₹{data.config.excessLimit.toLocaleString("en-IN")}) is shown under &ldquo;To electricity&rdquo;. A larger excess is rent paid ahead.
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Rent due to date" value={rupees(totals.due)} />
        <Tile label="Rent paid" value={rupees(totals.paid)} tone="good" />
        <Tile label="Balance" value={rupees(totals.balance)} tone={totals.balance > 0 ? "bad" : undefined} />
      </div>

      {tenants.length === 0 ? (
        <EmptyState>No tenants match your search.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
          <div className="max-h-[68vh] overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 z-20 bg-primary-light text-muted">
                <tr>
                  <th className="label-caps whitespace-nowrap px-3 py-3">Plot</th>
                  <th className="label-caps whitespace-nowrap px-3 py-3">Tenant</th>
                  <th className="label-caps whitespace-nowrap px-3 py-3">Move-in date</th>
                  <th className="label-caps whitespace-nowrap px-3 py-3">Rent starts</th>
                  <th className="label-caps whitespace-nowrap px-3 py-3 text-right">Months paid</th>
                  <th className="label-caps whitespace-nowrap px-3 py-3 text-right">Rent due</th>
                  <th className="label-caps whitespace-nowrap px-3 py-3 text-right">Rent paid</th>
                  <th className="label-caps whitespace-nowrap px-3 py-3 text-right">To electricity</th>
                  <th className="label-caps whitespace-nowrap px-3 py-3 text-right">Balance</th>
                  <th className="label-caps whitespace-nowrap px-3 py-3">Last paid</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t, i) => (
                  <tr key={t.unitId} className={`border-t border-line ${i % 2 ? "bg-primary-light/25" : "bg-white"}`}>
                    <td className="px-3 py-3 font-bold text-ink">{t.plotNumber}</td>
                    <td className="px-3 py-3 font-semibold text-foreground">{t.tenantName}</td>
                    <td className="px-3 py-3">
                      {t.moveInDate ? formatDate(t.moveInDate) : <span className="text-unpaid">Not set</span>}
                      {isBeforeBuildingOpened(t.moveInDate) && <span className="block text-[11px] font-semibold text-unpaid">before building opened - check year</span>}
                    </td>
                    <td className="px-3 py-3">{t.firstRentMonth ? shortMonth(t.firstRentMonth) : "—"}</td>
                    <td className="px-3 py-3 text-right">{t.monthsPaid} of {t.monthsBilled}</td>
                    <td className="px-3 py-3 text-right">{rupees(t.totalDue)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-paid">{rupees(t.totalPaid)}</td>
                    <td className="px-3 py-3 text-right text-partial">{t.overRent > 0 ? rupees(t.overRent) : "—"}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${t.balance > 0 ? "text-unpaid" : "text-foreground/50"}`}>{rupees(t.balance)}</td>
                    <td className="whitespace-nowrap px-3 py-3">{t.lastPaidDate ? formatDate(t.lastPaidDate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line-strong bg-primary-light font-bold text-ink">
                <tr>
                  <td className="px-3 py-3" colSpan={5}>Total ({tenants.length} tenants)</td>
                  <td className="px-3 py-3 text-right">{rupees(totals.due)}</td>
                  <td className="px-3 py-3 text-right">{rupees(totals.paid)}</td>
                  <td className="px-3 py-3 text-right">{rupees(totals.overRent)}</td>
                  <td className="px-3 py-3 text-right">{rupees(totals.balance)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
