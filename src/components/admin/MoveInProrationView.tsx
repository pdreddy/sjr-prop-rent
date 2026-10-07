"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, formatMonthLabel } from "@/lib/month";
import { calcMoveIn, isPartialFirstMonth, sumMoveIn, BILLING_DAYS } from "@/lib/moveInProration";
import type { MoveInProrationResponse, MoveInProrationTenant } from "@/lib/types";
import { IconSearch } from "@/components/icons";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const parseAmount = (text: string): number | null => {
  const n = text.trim() === "" ? null : Number(text);
  return n === null || !Number.isFinite(n) || n < 0 ? null : n;
};

export default function MoveInProrationView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [tenants, setTenants] = useState<MoveInProrationTenant[] | null>(null);
  // What is typed in each payment box; totals and rows recalculate from this on every keystroke.
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, number | null>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/move-in-proration", { cache: "no-store" });
        if (res.status === 401) return onUnauthorized();
        if (!res.ok) throw new Error("Failed to load");
        const json: MoveInProrationResponse = await res.json();
        if (cancelled) return;
        setTenants(json.tenants);
        setInputs(Object.fromEntries(json.tenants.map((t) => [t.unitId, t.paidByTenth === null ? "" : String(t.paidByTenth)])));
        setSaved(Object.fromEntries(json.tenants.map((t) => [t.unitId, t.paidByTenth])));
      } catch {
        if (!cancelled) setError("Could not load move-in proration. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onUnauthorized]);

  async function savePayment(unitId: string) {
    const amount = parseAmount(inputs[unitId] ?? "");
    if (amount === (saved[unitId] ?? null)) return;
    setRowError((e) => ({ ...e, [unitId]: "" }));
    try {
      const res = await fetch("/api/admin/move-in-proration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, paidByTenth: amount }),
      });
      if (res.status === 401) return onUnauthorized();
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
      setSaved((s) => ({ ...s, [unitId]: amount }));
    } catch (err) {
      setRowError((e) => ({ ...e, [unitId]: err instanceof Error ? err.message : "Could not save." }));
    }
  }

  // Only tenants with a partial first month need a calculation (plus any missing a move-in date, so it
  // can be fixed). Tenants who moved in on the 1st pay the full agreed rent and are just counted.
  const { rows, fullMonthCount } = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = (tenants ?? [])
      .filter((t) => !needle || t.plotNumber.toLowerCase().includes(needle) || t.tenantName.toLowerCase().includes(needle))
      .map((t) => ({ t, calc: calcMoveIn({ ...t, paidByTenth: parseAmount(inputs[t.unitId] ?? "") }) }));
    return { rows: all.filter((r) => !r.calc || isPartialFirstMonth(r.calc)), fullMonthCount: all.filter((r) => r.calc && !isPartialFirstMonth(r.calc)).length };
  }, [tenants, inputs, search]);
  const totals = useMemo(() => sumMoveIn(rows.map((r) => r.calc)), [rows]);

  if (error) return <div className="rounded-xl border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">{error}</div>;
  if (!tenants) {
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
          Only the first month is prorated, and only when a tenant did not move in on the 1st - every later month is the full
          agreed rent. Each month counts as {BILLING_DAYS} days; days charged = {BILLING_DAYS} − move-in day + 1.
          {fullMonthCount > 0 && ` ${fullMonthCount} tenant${fullMonthCount === 1 ? "" : "s"} moved in on the 1st and pay the full rent, so they are not listed.`} Enter the rent actually
          received by the 10th of the month after move-in; a payment covers the prorated rent first, anything above it is an
          electricity credit, and any shortfall stays as a rent balance. Leave the box blank if nothing was received.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Summary label="Prorated rent" value={rupees(totals.proratedRent)} cls="bg-primary-light text-primary-dark" />
        <Summary label="Payments received" value={rupees(totals.paid)} cls="bg-paid-bg text-paid" />
        <Summary label="Electricity credits" value={rupees(totals.electricityCredit)} cls="bg-partial-bg text-partial" />
        <Summary label="Remaining rent balance" value={rupees(totals.remainingBalance)} cls="bg-unpaid-bg text-unpaid" />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">No tenants with a partial first month match.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-primary/10 bg-white shadow-sm">
          <div className="max-h-[68vh] overflow-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="sticky top-0 z-20 bg-primary-dark text-white">
                <tr>
                  <th className="px-3 py-3 font-semibold">Plot</th>
                  <th className="px-3 py-3 font-semibold">Tenant</th>
                  <th className="px-3 py-3 font-semibold">Move-in date</th>
                  <th className="px-3 py-3 font-semibold">Move-in month</th>
                  <th className="px-3 py-3 text-right font-semibold">Days charged</th>
                  <th className="px-3 py-3 text-right font-semibold">Monthly rent + maint.</th>
                  <th className="px-3 py-3 text-right font-semibold">Daily rate (÷30)</th>
                  <th className="px-3 py-3 text-right font-semibold">Prorated rent</th>
                  <th className="min-w-[150px] px-3 py-3 text-right font-semibold">Paid by 10th of next month</th>
                  <th className="px-3 py-3 text-right font-semibold">Electricity credit</th>
                  <th className="px-3 py-3 text-right font-semibold">Remaining balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ t, calc }, i) => (
                  <tr key={t.unitId} className={`border-t border-primary/5 align-top ${i % 2 ? "bg-primary-light/25" : "bg-white"}`}>
                    <td className="px-3 py-3 font-bold text-primary-dark">{t.plotNumber}</td>
                    <td className="px-3 py-3 font-semibold text-foreground">{t.tenantName}</td>
                    <td className="px-3 py-3">{t.moveInDate ? formatDate(t.moveInDate) : <span className="text-unpaid">Not set</span>}</td>
                    <td className="px-3 py-3">{calc ? formatMonthLabel(calc.moveInMonth) : "—"}</td>
                    <td className="px-3 py-3 text-right">{calc ? calc.daysCharged : "—"}</td>
                    <td className="px-3 py-3 text-right">{calc ? rupees(calc.totalMonthlyRent) : "—"}</td>
                    <td className="px-3 py-3 text-right">{calc ? rupees(calc.dailyRate) : "—"}</td>
                    <td className="px-3 py-3 text-right font-semibold">{calc ? rupees(calc.proratedRent) : "—"}</td>
                    <td className="px-3 py-3 text-right">
                      {calc ? (
                        <>
                          <input
                            type="number"
                            min="0"
                            inputMode="decimal"
                            value={inputs[t.unitId] ?? ""}
                            onChange={(e) => setInputs((v) => ({ ...v, [t.unitId]: e.target.value }))}
                            onBlur={() => savePayment(t.unitId)}
                            aria-label={`Rent received by the 10th for plot ${t.plotNumber}`}
                            placeholder="Not entered"
                            className="min-h-10 w-28 rounded-lg border border-primary/20 bg-white px-2 text-right focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          {rowError[t.unitId] && <p className="mt-1 text-xs text-unpaid">{rowError[t.unitId]}</p>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-partial">{calc ? rupees(calc.electricityCredit) : "—"}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${calc && calc.remainingBalance > 0 ? "text-unpaid" : "text-foreground/50"}`}>
                      {calc ? rupees(calc.remainingBalance) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-primary/20 bg-primary-light font-bold text-primary-dark">
                <tr>
                  <td className="px-3 py-3" colSpan={7}>Total ({rows.filter((r) => r.calc).length} tenants)</td>
                  <td className="px-3 py-3 text-right">{rupees(totals.proratedRent)}</td>
                  <td className="px-3 py-3 text-right">{rupees(totals.paid)}</td>
                  <td className="px-3 py-3 text-right">{rupees(totals.electricityCredit)}</td>
                  <td className="px-3 py-3 text-right">{rupees(totals.remainingBalance)}</td>
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
