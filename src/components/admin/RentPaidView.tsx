"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, formatMonthLabel } from "@/lib/month";
import type { RentPaidResponse } from "@/lib/types";
import { IconSearch } from "@/components/icons";

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

  if (error) return <div className="rounded-xl border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">{error}</div>;
  if (!data) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-primary-light" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-primary/10 bg-white p-3.5 shadow-sm sm:p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-primary-dark">Search</span>
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Plot or tenant"
              className="min-h-11 w-full rounded-xl border border-primary/20 bg-white py-2 pl-9 pr-3 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </label>
        <p className="mt-2.5 text-xs text-foreground/55">
          Rent starts the month after move-in: the first record pays the move-in month (prorated if they didn&apos;t move in on the
          1st), then full rent every month through {formatMonthLabel(data.currentMonth)}. A month with no record counts as unpaid. Rent paid
          is capped at each month&apos;s rent; anything paid above it is shown under &ldquo;To electricity&rdquo;.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Summary label="Rent due to date" value={rupees(totals.due)} cls="bg-primary-light text-primary-dark" />
        <Summary label="Rent paid" value={rupees(totals.paid)} cls="bg-paid-bg text-paid" />
        <Summary label="Balance" value={rupees(totals.balance)} cls="bg-unpaid-bg text-unpaid" />
      </div>

      {tenants.length === 0 ? (
        <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">No tenants match your search.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-primary/10 bg-white shadow-sm">
          <div className="max-h-[68vh] overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 z-20 bg-primary-dark text-white">
                <tr>
                  <th className="px-3 py-3 font-semibold">Plot</th>
                  <th className="px-3 py-3 font-semibold">Tenant</th>
                  <th className="px-3 py-3 font-semibold">Move-in date</th>
                  <th className="px-3 py-3 font-semibold">Rent starts</th>
                  <th className="px-3 py-3 text-right font-semibold">Months paid</th>
                  <th className="px-3 py-3 text-right font-semibold">Rent due</th>
                  <th className="px-3 py-3 text-right font-semibold">Rent paid</th>
                  <th className="px-3 py-3 text-right font-semibold">To electricity</th>
                  <th className="px-3 py-3 text-right font-semibold">Balance</th>
                  <th className="px-3 py-3 font-semibold">Last paid</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t, i) => (
                  <tr key={t.unitId} className={`border-t border-primary/5 ${i % 2 ? "bg-primary-light/25" : "bg-white"}`}>
                    <td className="px-3 py-3 font-bold text-primary-dark">{t.plotNumber}</td>
                    <td className="px-3 py-3 font-semibold text-foreground">{t.tenantName}</td>
                    <td className="px-3 py-3">{t.moveInDate ? formatDate(t.moveInDate) : <span className="text-unpaid">Not set</span>}</td>
                    <td className="px-3 py-3">{t.firstRentMonth ? formatMonthLabel(t.firstRentMonth) : "—"}</td>
                    <td className="px-3 py-3 text-right">{t.monthsPaid} of {t.monthsBilled}</td>
                    <td className="px-3 py-3 text-right">{rupees(t.totalDue)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-paid">{rupees(t.totalPaid)}</td>
                    <td className="px-3 py-3 text-right text-partial">{t.overRent > 0 ? rupees(t.overRent) : "—"}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${t.balance > 0 ? "text-unpaid" : "text-foreground/50"}`}>{rupees(t.balance)}</td>
                    <td className="px-3 py-3">{t.lastPaidDate ? formatDate(t.lastPaidDate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-primary/20 bg-primary-light font-bold text-primary-dark">
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

function Summary({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 text-center ${cls}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}
