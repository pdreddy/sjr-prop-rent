"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import { getCurrentMonth, getMonthOptions, formatDate, formatMonthLabel } from "@/lib/month";
import type { PublicStatusResponse, PublicPlot } from "@/lib/types";

const monthOptions = getMonthOptions();

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function ElectricityBreakdown({ plot }: { plot: PublicPlot }) {
  const { months, totalPending, totalUnits } = plot.electricity;
  if (months.length === 0) {
    return <p className="text-sm text-foreground/50">No electricity pending.</p>;
  }
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-foreground/60">
        <tr>
          <th className="py-1 font-medium">Month</th>
          <th className="py-1 text-right font-medium">Units</th>
          <th className="py-1 text-right font-medium">Pending</th>
        </tr>
      </thead>
      <tbody>
        {months.map((m) => (
          <tr key={m.month} className="border-t border-primary/5">
            <td className="py-1">{formatMonthLabel(m.month)}</td>
            <td className="py-1 text-right">{m.units}</td>
            <td className="py-1 text-right">{inr(m.pending)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-primary/20 font-semibold">
          <td className="py-1">Total</td>
          <td className="py-1 text-right">{totalUnits}</td>
          <td className="py-1 text-right text-unpaid">{inr(totalPending)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function Home() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<PublicStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/status?month=${encodeURIComponent(m)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load status");
      const json: PublicStatusResponse = await res.json();
      setData(json);
    } catch {
      setError("Could not load rent status. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/month-change
    load(month);
  }, [month, load]);

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="bg-primary px-4 py-5 text-white shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {data?.buildingName ?? "SJR Building"}
          </h1>
          <Link
            href="/admin/login"
            className="rounded-md border border-white/40 px-3 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10"
          >
            Admin
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-5">
          <MonthYearSelector month={month} options={monthOptions} onChange={setMonth} />
        </div>

        {loading && (
          <div className="flex flex-col gap-3" aria-live="polite" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-primary-light" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-unpaid/30 bg-unpaid-bg p-4 text-unpaid">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            <div className="mb-5 rounded-xl border border-primary/15 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-foreground/70">Rent Collection Summary</p>
              <p className="mt-1 text-2xl font-bold text-primary-dark">
                {data.paidCount} of {data.totalPlots} Paid
              </p>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-primary-light">
                <div
                  className="h-full rounded-full bg-paid transition-all"
                  style={{
                    width: `${
                      data.totalPlots > 0 ? (data.paidCount / data.totalPlots) * 100 : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="mb-5 rounded-xl border border-primary/15 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-foreground/70">
                Electricity Pending (all months)
              </p>
              <p className="mt-1 text-2xl font-bold text-unpaid">
                {inr(data.totalElectricityPending)}
              </p>
            </div>

            {data.plots.length === 0 ? (
              <div className="rounded-xl border border-primary/15 bg-white p-6 text-center text-foreground/60">
                No plots have been added yet.
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <ul className="flex flex-col gap-2.5 sm:hidden">
                  {data.plots.map((plot) => (
                    <li
                      key={plot.plotNumber}
                      className="rounded-xl border border-primary/10 bg-white px-4 py-3.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base font-semibold text-foreground">
                          Plot {plot.plotNumber}
                        </span>
                        <StatusBadge status={plot.status} />
                      </div>
                      <p className="mt-1 text-sm text-foreground/70">
                        {plot.tenantName || "No tenant"}
                      </p>
                      <p className="text-sm text-foreground/50">
                        Joined {formatDate(plot.moveInDate)}
                      </p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-medium text-primary-dark">
                          Electricity pending: {inr(plot.electricity.totalPending)}
                        </summary>
                        <div className="mt-2">
                          <ElectricityBreakdown plot={plot} />
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>

                {/* Desktop table */}
                <div className="hidden overflow-x-auto rounded-xl border border-primary/10 bg-white shadow-sm sm:block">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-primary-light text-primary-dark">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Plot</th>
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold">Date joined</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Electricity pending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.plots.map((plot) => (
                        <tr key={plot.plotNumber} className="border-t border-primary/5">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {plot.plotNumber}
                          </td>
                          <td className="px-4 py-3 text-foreground/80">
                            {plot.tenantName || "—"}
                          </td>
                          <td className="px-4 py-3 text-foreground/80">
                            {formatDate(plot.moveInDate)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={plot.status} />
                          </td>
                          <td className="px-4 py-3 align-top">
                            <details>
                              <summary className="cursor-pointer font-medium text-foreground/80">
                                {inr(plot.electricity.totalPending)}
                              </summary>
                              <div className="mt-2 min-w-56">
                                <ElectricityBreakdown plot={plot} />
                              </div>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>

      <footer className="px-4 py-4 text-center text-xs text-foreground/40">
        Phone numbers, rent amounts and payment history are private and only visible to admins.
      </footer>
    </div>
  );
}
