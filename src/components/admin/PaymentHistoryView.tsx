"use client";

import { Toolbar, ToolbarButton, Tile, TileGroup, EmptyState } from "./ui";
import { useEffect, useMemo, useState } from "react";
import { formatDate, formatMonthLabel, isBeforeBuildingOpened } from "@/lib/month";
import type { PaymentHistoryResponse, PaymentHistoryTenant } from "@/lib/types";
import PaymentMonthDetail from "./PaymentMonthDetail";

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

  if (error) return <div className="rounded-control border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">{error}</div>;
  if (!data) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-control bg-primary-light" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        title="Payment history"
        subtitle={`Every tenant's rent and electricity, month by month, to ${formatMonthLabel(data.currentMonth)}`}
        search={{ value: search, onChange: setSearch, placeholder: "Search plot or tenant" }}
        actions={
          <ToolbarButton onClick={() => setOpen(open.size === tenants.length ? new Set() : new Set(tenants.map((t) => t.unitId)))}>
            {open.size === tenants.length && tenants.length > 0 ? "Collapse all" : "Expand all"}
          </ToolbarButton>
        }
        help={
          <>
            Rent starts the month after move-in and runs to {formatMonthLabel(data.currentMonth)}. Everything paid counts as rent. Only a small
            amount over the month&apos;s rent (under ₹{data.config.excessLimit.toLocaleString("en-IN")}, e.g. ₹500 or ₹1,000 on ₹20,000 rent) is moved to electricity as paid; a larger
            excess (e.g. ₹20,000 paid on a ₹10,667 part-month) is rent paid ahead and covers later months. Electricity is billed
            from meter readings at ₹{data.ratePerUnit}/unit and any unused electricity payment carries forward to the next bill. With no meter reading, the bill defaults to ₹{data.config.defaultHigh} (plots {data.config.highPlots.join(", ") || "none"}) or ₹{data.config.defaultStandard} (all other plots). A payment shown
            as &ldquo;before rent start&rdquo; is filed under a month earlier than the tenant&apos;s first rent month. Click any month for
            every detail: rent, payment, electricity, credit and notes.
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)]">
        <Tile label="Total received" value={rupees(grand.totalReceived)} tone="good" />
        <TileGroup
          title="Rent"
          items={[
            { label: "Due", value: rupees(grand.rentDue) },
            { label: "Paid", value: rupees(grand.rentPaid), tone: "good" },
            { label: "Balance", value: rupees(grand.rentBalance), tone: grand.rentBalance > 0 ? "bad" : undefined },
          ]}
        />
        <TileGroup
          title="Electricity"
          items={[
            { label: "Billed", value: rupees(grand.electricityBill) },
            { label: "Paid", value: rupees(grand.electricityPaid), tone: "good" },
            { label: "Balance", value: rupees(grand.electricityBalance), tone: grand.electricityBalance > 0 ? "bad" : undefined },
          ]}
        />
      </div>

      {tenants.length === 0 && <EmptyState>No tenants match your search.</EmptyState>}

      {tenants.map((t) => {
        const expanded = open.has(t.unitId);
        const owing = t.totals.rentBalance + t.totals.electricityBalance;
        return (
          <section key={t.unitId} className={`rounded-card border border-l-4 border-line bg-white shadow-card ${owing > 0 ? "border-l-unpaid" : "border-l-paid"}`}>
            <button type="button" onClick={() => toggle(t.unitId)} aria-expanded={expanded} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 p-3.5 text-left sm:p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto]">
              <div className="min-w-0">
                <p className="text-lg font-extrabold leading-tight text-ink">Plot {t.plotNumber}</p>
                <p className="truncate text-sm font-medium text-foreground/80">{t.tenantName}</p>
                <p className="truncate text-xs text-muted">
                  Moved in {t.moveInDate ? formatDate(t.moveInDate) : "date not set"}
                  {t.firstRentMonth ? ` · rent from ${formatMonthLabel(t.firstRentMonth)}` : ""}
                  {isBeforeBuildingOpened(t.moveInDate) && <b className="text-unpaid"> · before building opened - check year</b>}
                </p>
              </div>
              <span aria-hidden="true" className="col-start-2 row-start-1 text-lg text-muted lg:col-start-4">{expanded ? "−" : "+"}</span>
              <div className="col-span-2 grid grid-cols-2 gap-3 lg:col-span-2 lg:col-start-2 lg:row-start-1">
                <div className="min-w-0">
                  <p className="label-caps">Rent</p>
                  <p className="money">{rupees(t.totals.rentPaid)} <span className="text-sm font-medium text-muted">of {rupees(t.totals.rentDue)}</span></p>
                  <p className={`text-xs font-semibold ${t.totals.rentBalance > 0 ? "text-unpaid" : "text-paid"}`}>
                    {t.totals.rentBalance > 0 ? `${rupees(t.totals.rentBalance)} due` : "Settled"}
                    {t.totals.rentAdvance > 0 && <span className="font-medium text-partial"> · {rupees(t.totals.rentAdvance)} paid ahead</span>}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="label-caps">Electricity</p>
                  <p className="money">{rupees(t.totals.electricityPaid)} <span className="text-sm font-medium text-muted">of {rupees(t.totals.electricityBill)}</span></p>
                  <p className={`text-xs font-semibold ${t.totals.electricityBalance > 0 ? "text-unpaid" : "text-paid"}`}>
                    {t.totals.electricityBalance > 0 ? `${rupees(t.totals.electricityBalance)} due` : "Settled"}
                    {t.totals.unusedCredit > 0 && <span className="font-medium text-partial"> · {rupees(t.totals.unusedCredit)} credit</span>}
                  </p>
                </div>
              </div>
            </button>
            {expanded && (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-foreground/45">
                    <tr>
                      <th className="label-caps whitespace-nowrap px-3 py-2">Month</th>
                      <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Rent due</th>
                      <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Total paid</th>
                      <th className="label-caps whitespace-nowrap px-3 py-2">Paid on</th>
                      <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Rent paid</th>
                      <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Excess → elec.</th>
                      <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Rent balance</th>
                      <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Meter</th>
                      <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Elec. bill</th>
                      <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Elec. paid</th>
                      <th className="label-caps whitespace-nowrap px-3 py-2 text-right">Elec. balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
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
                            <PaymentMonthDetail tenant={t} month={m} ratePerUnit={data.config} monthLabel={formatMonthLabel(m.month)} />
                          </td>
                        </tr>
                      ),
                      ];
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-line-strong bg-primary-light font-bold text-ink">
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
