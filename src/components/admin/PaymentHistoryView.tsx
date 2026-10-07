"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, formatMonthLabel, isBeforeBuildingOpened } from "@/lib/month";
import type { PaymentHistoryResponse, PaymentHistoryTenant } from "@/lib/types";
import PaymentMonthDetail from "./PaymentMonthDetail";
import { IconSearch } from "@/components/icons";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function PaymentHistoryView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<PaymentHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [openMonth, setOpenMonth] = useState<string | null>(null); // `${unitId}|${month}`

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/payment-history", { cache: "no-store" });
        if (res.status === 401) return onUnauthorized();
        if (!res.ok) throw new Error("Failed to load");
        const json: PaymentHistoryResponse = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not load payment history. Please try again.");
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
  const grand = useMemo(() => {
    const sum = (pick: (t: PaymentHistoryTenant) => number) => tenants.reduce((s, t) => s + pick(t), 0);
    return {
      totalReceived: sum((t) => t.totals.totalReceived), rentDue: sum((t) => t.totals.rentDue), rentPaid: sum((t) => t.totals.rentPaid), rentBalance: sum((t) => t.totals.rentBalance),
      electricityBill: sum((t) => t.totals.electricityBill), electricityPaid: sum((t) => t.totals.electricityPaid), electricityBalance: sum((t) => t.totals.electricityBalance),
    };
  }, [tenants]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (error) return <div className="rounded-xl border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">{error}</div>;
  if (!data) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-primary-light" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-primary/10 bg-white p-3.5 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
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
          <button
            type="button"
            onClick={() => setOpen(open.size === tenants.length ? new Set() : new Set(tenants.map((t) => t.unitId)))}
            className="min-h-11 rounded-xl border border-primary/30 bg-white px-4 text-sm font-semibold text-primary-dark hover:bg-primary-light"
          >
            {open.size === tenants.length && tenants.length > 0 ? "Collapse all" : "Expand all"}
          </button>
        </div>
        <p className="mt-2.5 text-xs text-foreground/55">
          Rent starts the month after move-in and runs to {formatMonthLabel(data.currentMonth)}. Everything paid counts as rent. Only a small
          amount over the month&apos;s rent (under ₹1,500, e.g. ₹500 or ₹1,000 on ₹20,000 rent) is moved to electricity as paid; a larger
          excess (e.g. ₹20,000 paid on a ₹10,667 part-month) is rent paid ahead and covers later months. Electricity is billed
          from meter readings at ₹{data.ratePerUnit}/unit and any unused electricity payment carries forward to the next bill. With no meter reading, the bill defaults to ₹750 (plots 101, 201, 301, 401, 501) or ₹500 (all other plots). A payment shown
          as &ldquo;before rent start&rdquo; is filed under a month earlier than the tenant&apos;s first rent month. Click any month for
          every detail: rent, payment, electricity, credit and notes.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Summary label="Total received" value={rupees(grand.totalReceived)} cls="bg-paid-bg text-paid" />
        <Summary label="Rent due" value={rupees(grand.rentDue)} cls="bg-primary-light text-primary-dark" />
        <Summary label="Rent paid" value={rupees(grand.rentPaid)} cls="bg-paid-bg text-paid" />
        <Summary label="Rent balance" value={rupees(grand.rentBalance)} cls="bg-unpaid-bg text-unpaid" />
        <Summary label="Electricity billed" value={rupees(grand.electricityBill)} cls="bg-primary-light text-primary-dark" />
        <Summary label="Electricity paid" value={rupees(grand.electricityPaid)} cls="bg-paid-bg text-paid" />
        <Summary label="Electricity balance" value={rupees(grand.electricityBalance)} cls="bg-unpaid-bg text-unpaid" />
      </div>

      {tenants.length === 0 && <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">No tenants match your search.</div>}

      {tenants.map((t) => {
        const expanded = open.has(t.unitId);
        const owing = t.totals.rentBalance + t.totals.electricityBalance;
        return (
          <section key={t.unitId} className={`rounded-2xl border border-l-4 border-primary/10 bg-white shadow-sm ${owing > 0 ? "border-l-unpaid" : "border-l-paid"}`}>
            <button type="button" onClick={() => toggle(t.unitId)} aria-expanded={expanded} className="flex w-full flex-col gap-2 p-3.5 text-left sm:p-4">
              <div className="flex w-full items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xl font-extrabold leading-tight text-primary-dark">Plot {t.plotNumber}</p>
                  <p className="truncate text-sm text-foreground/60">
                    {t.tenantName} · Moved in {t.moveInDate ? formatDate(t.moveInDate) : "date not set"}
                    {isBeforeBuildingOpened(t.moveInDate) && <b className="text-unpaid"> (before building opened - check year)</b>}
                    {t.firstRentMonth ? ` · Rent starts ${formatMonthLabel(t.firstRentMonth)}` : ""}
                  </p>
                </div>
                <span aria-hidden="true" className="shrink-0 text-foreground/60">{expanded ? "−" : "+"}</span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span>
                  Total paid <b>{rupees(t.totals.totalReceived)}</b>
                  {t.totals.totalReceived !== t.totals.rentPaid && <span className="text-foreground/55"> = {rupees(t.totals.rentPaid)} rent{t.totals.totalReceived > t.totals.rentPaid && ` + ${rupees(t.totals.totalReceived - t.totals.rentPaid)} electricity`}</span>}
                </span>
                <span>Rent <b>{rupees(t.totals.rentPaid)}</b> of {rupees(t.totals.rentDue)} paid{t.totals.rentBalance > 0 && <b className="text-unpaid"> · {rupees(t.totals.rentBalance)} due</b>}{t.totals.rentAdvance > 0 && <span className="text-partial"> · {rupees(t.totals.rentAdvance)} paid ahead</span>}</span>
                <span>Electricity <b>{rupees(t.totals.electricityPaid)}</b> paid · {rupees(t.totals.electricityBill)} billed{t.totals.electricityBalance > 0 && <b className="text-unpaid"> · {rupees(t.totals.electricityBalance)} due</b>}</span>
                {t.totals.unusedCredit > 0 && <span className="text-partial">Unused credit {rupees(t.totals.unusedCredit)}</span>}
              </div>
            </button>
            {expanded && (
              <div className="overflow-x-auto border-t border-primary/10">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-foreground/45">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Month</th>
                      <th className="px-3 py-2 text-right font-semibold">Rent due</th>
                      <th className="px-3 py-2 text-right font-semibold">Total paid</th>
                      <th className="px-3 py-2 font-semibold">Paid on</th>
                      <th className="px-3 py-2 text-right font-semibold">Rent paid</th>
                      <th className="px-3 py-2 text-right font-semibold">Excess → elec.</th>
                      <th className="px-3 py-2 text-right font-semibold">Rent balance</th>
                      <th className="px-3 py-2 text-right font-semibold">Meter</th>
                      <th className="px-3 py-2 text-right font-semibold">Elec. bill</th>
                      <th className="px-3 py-2 text-right font-semibold">Elec. paid</th>
                      <th className="px-3 py-2 text-right font-semibold">Elec. balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/10">
                    {t.months.map((m) => {
                      const key = `${t.unitId}|${m.month}`;
                      const monthOpen = openMonth === key;
                      return [
                      <tr
                        key={m.month}
                        onClick={() => setOpenMonth(monthOpen ? null : key)}
                        aria-expanded={monthOpen}
                        title="Click for full details"
                        className={`cursor-pointer hover:bg-primary-light/40 ${monthOpen ? "bg-primary-light/60" : m.beforeRentStart ? "bg-partial-bg/50" : ""}`}
                      >
                        <td className="px-3 py-2 font-medium">
                          {formatMonthLabel(m.month)}
                          {m.unapplied ? <span className="block text-[11px] text-partial">earlier tenant? not counted</span> : m.beforeRentStart && <span className="block text-[11px] text-partial">before rent start</span>}
                          {!m.recorded && !m.beforeRentStart && <span className="block text-[11px] text-foreground/45">no record</span>}
                        </td>
                        <td className="px-3 py-2 text-right">{rupees(m.rentDue)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{rupees(m.amountReceived)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{m.paidDate ? formatDate(m.paidDate) : "—"}</td>
                        <td className="px-3 py-2 text-right font-semibold text-paid">{rupees(m.rentPaid)}</td>
                        <td className={`px-3 py-2 text-right ${m.overpayment > 0 ? "font-semibold text-partial" : "text-foreground/50"}`}>{m.overpayment > 0 ? rupees(m.overpayment) : "—"}</td>
                        <td className={`px-3 py-2 text-right ${m.rentBalance > 0 ? "font-semibold text-unpaid" : "text-foreground/50"}`}>{rupees(m.rentBalance)}</td>
                        <td className="px-3 py-2 text-right text-foreground/70">{m.electricityDefault ? "default" : m.currReading > 0 || m.prevReading > 0 ? `${m.prevReading} → ${m.currReading}` : "—"}</td>
                        <td className="px-3 py-2 text-right">{rupees(m.electricityBill)}</td>
                        <td className="px-3 py-2 text-right text-paid">{rupees(m.electricityPaid)}</td>
                        <td className={`px-3 py-2 text-right ${m.electricityBalance > 0 ? "font-semibold text-unpaid" : "text-foreground/50"}`}>{rupees(m.electricityBalance)}</td>
                      </tr>,
                      monthOpen && (
                        <tr key={`${m.month}-detail`}>
                          <td colSpan={11} className="p-0">
                            <PaymentMonthDetail tenant={t} month={m} ratePerUnit={data.ratePerUnit} monthLabel={formatMonthLabel(m.month)} />
                          </td>
                        </tr>
                      ),
                      ];
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-primary/20 bg-primary-light font-bold text-primary-dark">
                    <tr>
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right">{rupees(t.totals.rentDue)}</td>
                      <td className="px-3 py-2 text-right">{rupees(t.totals.totalReceived)}</td>
                      <td />
                      <td className="px-3 py-2 text-right">{rupees(t.totals.rentPaid)}</td>
                      <td className="px-3 py-2 text-right">{t.totals.totalReceived > t.totals.rentPaid ? rupees(t.totals.totalReceived - t.totals.rentPaid) : "—"}</td>
                      <td className="px-3 py-2 text-right">{rupees(t.totals.rentBalance)}</td>
                      <td />
                      <td className="px-3 py-2 text-right">{rupees(t.totals.electricityBill)}</td>
                      <td className="px-3 py-2 text-right">{rupees(t.totals.electricityPaid)}</td>
                      <td className="px-3 py-2 text-right">{rupees(t.totals.electricityBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Summary({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 text-center ${cls}`}>
      <p className="text-base font-bold leading-tight sm:text-lg">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}
