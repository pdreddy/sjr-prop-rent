"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMonthLabel, formatDate } from "@/lib/month";
import type {
  ElectricityMonthStatus,
  ElectricityStatementResponse,
  ElectricityStatementTenant,
} from "@/lib/types";
import PaymentMonthDetail from "./PaymentMonthDetail";
import type { PaymentHistoryResponse } from "@/lib/types";
import { IconSearch } from "@/components/icons";

const STATUS_STYLE: Record<ElectricityMonthStatus, { label: string; cls: string }> = {
  PAID: { label: "Paid", cls: "bg-paid-bg text-paid" },
  PARTIAL: { label: "Partially paid", cls: "bg-partial-bg text-partial" },
  UNPAID: { label: "Unpaid", cls: "bg-unpaid-bg text-unpaid" },
  NONE: { label: "No payment recorded", cls: "bg-vacant-bg text-vacant" },
};

const rupees = (n: number) => `₹${n.toFixed(0)}`;

function MonthStatusBadge({ status }: { status: ElectricityMonthStatus }) {
  const { label, cls } = STATUS_STYLE[status];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export default function ElectricityStatementView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<ElectricityStatementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  // Full rent + electricity detail for a clicked month, fetched once on the first click.
  const [history, setHistory] = useState<PaymentHistoryResponse | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [historyRequested, setHistoryRequested] = useState(false);

  useEffect(() => {
    if (!historyRequested) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/payment-history", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load");
        const json: PaymentHistoryResponse = await res.json();
        if (!cancelled) setHistory(json);
      } catch {
        if (!cancelled) setHistoryError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyRequested]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/electricity/statement", { cache: "no-store" });
        if (res.status === 401) return onUnauthorized();
        if (!res.ok) throw new Error("Failed to load");
        const json: ElectricityStatementResponse = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not load the electricity statement. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onUnauthorized]);

  const tenants = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.tenants ?? []).filter(
      (t) => !needle || t.plotNumber.toLowerCase().includes(needle) || t.tenantName?.toLowerCase().includes(needle)
    );
  }, [data, search]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-primary-light" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return <div className="rounded-xl border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">{error}</div>;
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
          Rate ₹{data.ratePerUnit}/unit. Each month&apos;s baseline is rent + maintenance; anything paid above it is credited
          to electricity, oldest bill first, and unused credit carries forward. Months run from the tenant&apos;s joining month
          to {formatMonthLabel(data.currentMonth)}.
        </p>
      </div>

      {tenants.length === 0 && (
        <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">
          No tenants match your search.
        </div>
      )}

      {tenants.map((tenant) => (
        <TenantStatement
          key={tenant.unitId}
          tenant={tenant}
          expanded={open === tenant.unitId}
          onToggle={() => setOpen(open === tenant.unitId ? null : tenant.unitId)}
          history={history}
          historyError={historyError}
          onMonthClick={() => setHistoryRequested(true)}
        />
      ))}
    </div>
  );
}

function TenantStatement({
  tenant,
  expanded,
  onToggle,
  history,
  historyError,
  onMonthClick,
}: {
  tenant: ElectricityStatementTenant;
  expanded: boolean;
  onToggle: () => void;
  history: PaymentHistoryResponse | null;
  historyError: boolean;
  onMonthClick: () => void;
}) {
  const { totals } = tenant;
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const historyTenant = history?.tenants.find((t) => t.unitId === tenant.unitId) ?? null;
  return (
    <section className="rounded-2xl border border-primary/10 bg-white shadow-sm">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full flex-wrap items-center justify-between gap-3 p-3.5 text-left sm:p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Plot {tenant.plotNumber}</p>
          <p className="truncate text-base font-bold text-foreground">{tenant.tenantName}</p>
          <p className="text-xs text-foreground/50">Joined {formatDate(tenant.moveInDate)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-foreground/60">Billed {rupees(totals.bill)}</span>
          <span className="text-paid">Credited {rupees(totals.credited)}</span>
          <span className={`font-bold ${totals.balance > 0 ? "text-unpaid" : "text-paid"}`}>Due {rupees(totals.balance)}</span>
          {totals.unusedCredit > 0 && <span className="text-foreground/60">Unused credit {rupees(totals.unusedCredit)}</span>}
          <span className="text-foreground/40" aria-hidden="true">{expanded ? "−" : "+"}</span>
        </div>
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-primary/10">
          {tenant.months.length === 0 ? (
            <p className="p-4 text-sm text-foreground/60">No months to show yet.</p>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-primary-light text-xs uppercase tracking-wide text-primary-dark">
                <tr>
                  <th className="px-3 py-2 font-semibold">Month</th>
                  <th className="px-3 py-2 text-right font-semibold">Rent due</th>
                  <th className="px-3 py-2 text-right font-semibold">Total paid</th>
                  <th className="px-3 py-2 text-right font-semibold">Over rent</th>
                  <th className="px-3 py-2 text-right font-semibold">Electricity bill</th>
                  <th className="px-3 py-2 text-right font-semibold">Credited</th>
                  <th className="px-3 py-2 text-right font-semibold">Balance</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/10">
                {tenant.months.map((m) => [
                  <tr
                    key={m.month}
                    onClick={() => {
                      onMonthClick();
                      setOpenMonth(openMonth === m.month ? null : m.month);
                    }}
                    aria-expanded={openMonth === m.month}
                    title="Click for full details"
                    className={`cursor-pointer hover:bg-primary-light/40 ${openMonth === m.month ? "bg-primary-light/60" : ""}`}
                  >
                    <td className="px-3 py-2 font-medium">{formatMonthLabel(m.month)}</td>
                    {m.recorded ? (
                      <>
                        <td className="px-3 py-2 text-right">
                          {rupees(m.baseline)}
                          {m.maintenanceAmount > 0 && (
                            <span className="block text-[11px] text-foreground/45">
                              {rupees(m.rentAmount)} + {rupees(m.maintenanceAmount)} maint.
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{rupees(m.totalPaid)}</td>
                        <td className="px-3 py-2 text-right">{m.excess > 0 ? rupees(m.excess) : "—"}</td>
                        <td className="px-3 py-2 text-right">{rupees(m.electricityBill)}</td>
                        <td className="px-3 py-2 text-right">
                          {rupees(m.credited)}
                          {m.markedPaid && <span className="block text-[11px] text-foreground/45">marked paid</span>}
                          {!m.markedPaid && m.carriedForward > 0 && (
                            <span className="block text-[11px] text-foreground/45">{rupees(m.carriedForward)} carried fwd</span>
                          )}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${m.balance > 0 ? "text-unpaid" : ""}`}>{rupees(m.balance)}</td>
                      </>
                    ) : (
                      <td colSpan={6} className="px-3 py-2 text-foreground/45">
                        No record for this month
                        {m.carriedForward > 0 ? ` · ${rupees(m.carriedForward)} credit carried forward` : ""}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <MonthStatusBadge status={m.status} />
                    </td>
                  </tr>,
                  openMonth === m.month && (
                    <tr key={`${m.month}-detail`}>
                      <td colSpan={8} className="p-0">
                        {historyError ? (
                          <p className="px-4 py-3 text-sm text-unpaid">Could not load the full details. Please try again.</p>
                        ) : !history || !historyTenant ? (
                          <p className="px-4 py-3 text-sm text-foreground/60">Loading details…</p>
                        ) : (
                          <PaymentMonthDetail
                            tenant={historyTenant}
                            month={historyTenant.months.find((x) => x.month === m.month) ?? null}
                            ratePerUnit={history.ratePerUnit}
                            monthLabel={formatMonthLabel(m.month)}
                          />
                        )}
                      </td>
                    </tr>
                  ),
                ])}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
