"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import ChangePasswordModal from "./ChangePasswordModal";
import {
  getCurrentMonth,
  getMonthOptions,
  getPreviousMonth,
  formatMonthLabel,
} from "@/lib/month";
import type { DashboardResponse } from "@/lib/types";
import {
  IconBuilding,
  IconCopy,
  IconLock,
  IconLogout,
  IconPlus,
  IconSearch,
} from "@/components/icons";

const monthOptions = getMonthOptions();
const STATUS_FILTERS = ["ALL", "PAID", "UNPAID", "PARTIAL", "VACANT"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function AdminDashboard({ username }: { username: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(getCurrentMonth());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [copying, setCopying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ month, status: statusFilter });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/dashboard?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const json: DashboardResponse = await res.json();
      setData(json);
    } catch {
      setError("Could not load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [month, statusFilter, search, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/filter-change
    load();
  }, [load]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  async function handleCopyPreviousMonth() {
    const sourceMonth = getPreviousMonth(month);
    if (
      !confirm(
        `Copy tenant and rent info from ${formatMonthLabel(sourceMonth)} into ${formatMonthLabel(
          month
        )} for plots without a record yet?`
      )
    ) {
      return;
    }
    setCopying(true);
    try {
      const res = await fetch("/api/admin/copy-month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceMonth, targetMonth: month }),
      });
      const json = await res.json();
      if (res.ok) {
        load();
      } else {
        setError(json.error ?? "Failed to copy previous month.");
      }
    } finally {
      setCopying(false);
    }
  }

  const totals = data?.totals;
  const monthParam = encodeURIComponent(month);
  const selectedYear = month.slice(0, 4);
  const yearMonths = Array.from(
    { length: 12 },
    (_, index) => `${selectedYear}-${String(index + 1).padStart(2, "0")}`
  );

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-primary/10 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <IconBuilding className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight text-primary-dark sm:text-lg">
                SJR Rent Tracker
              </h1>
              <p className="text-xs text-foreground/45">Signed in as {username}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowChangePassword(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-primary/20 px-3.5 py-1.5 text-sm font-medium text-primary-dark hover:bg-primary-light"
            >
              <IconLock className="h-4 w-4" />
              <span className="hidden sm:inline">Change password</span>
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-primary/20 px-3.5 py-1.5 text-sm font-medium text-primary-dark hover:bg-primary-light"
            >
              <IconLogout className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-3 py-5 sm:px-6">
        {error && (
          <div className="mb-4 rounded-lg border border-unpaid/30 bg-unpaid-bg px-3 py-2 text-sm text-unpaid">
            {error}
          </div>
        )}

        {totals && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/10 bg-white px-3.5 py-2.5 text-sm shadow-sm">
            <Stat label="Plots" value={totals.totalUnits} />
            <StatDot />
            <Stat label="Paid" value={totals.numPaid} accent="paid" />
            <StatDot />
            <Stat label="Partial" value={totals.numPartial} accent="partial" />
            <StatDot />
            <Stat label="Unpaid" value={totals.numUnpaid} accent="unpaid" />
            <StatDot />
            <Stat label="Expected" value={`₹${totals.totalExpected.toFixed(0)}`} />
            <StatDot />
            <Stat label="Outstanding" value={`₹${totals.outstandingBalance.toFixed(0)}`} />
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-primary/10 bg-white p-3 shadow-sm sm:p-4">
          <MonthYearSelector month={month} options={monthOptions} onChange={setMonth} />

          <label className="flex flex-1 min-w-[160px] flex-col gap-1">
            <span className="text-sm font-medium text-primary-dark">Search</span>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Plot, tenant or phone"
                className="min-h-11 w-full rounded-xl border border-primary/20 bg-white py-2 pl-9 pr-3 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </label>

          <div className="flex w-full flex-col gap-1 sm:w-auto">
            <span className="text-sm font-medium text-primary-dark">Filter</span>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`min-h-9 rounded-full border px-3 py-1.5 text-sm font-medium ${
                    statusFilter === s
                      ? "border-primary bg-primary text-white"
                      : "border-primary/20 bg-white text-foreground/70"
                  }`}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex w-full gap-2 sm:w-auto">
            <Link
              href={`/admin/plots/new?month=${monthParam}`}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark sm:flex-none"
            >
              <IconPlus className="h-4 w-4" />
              Add plot
            </Link>
            <button
              onClick={handleCopyPreviousMonth}
              disabled={copying}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-primary/30 bg-white px-4 py-2.5 text-sm font-semibold text-primary-dark hover:bg-primary-light disabled:opacity-60 sm:flex-none"
            >
              <IconCopy className="h-4 w-4" />
              {copying ? "Copying..." : "Copy last month"}
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-primary-light" />
            ))}
          </div>
        )}

        {!loading && data && data.rows.length === 0 && (
          <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">
            No plots match your search or filter.
          </div>
        )}

        {!loading && data && data.rows.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-primary/10 bg-white shadow-sm">
            <p className="border-b border-primary/10 bg-white px-3 py-2 text-xs text-foreground/55 sm:hidden">
              Swipe left to view every month →
            </p>
            <div
              className="max-w-full touch-pan-x overflow-x-scroll overscroll-x-contain"
              tabIndex={0}
              aria-label={`Plot and monthly rent details for ${selectedYear}`}
            >
              <table className="w-max min-w-full text-left text-sm">
                <thead className="bg-primary-light text-primary-dark">
                  <tr>
                    <th className="min-w-28 whitespace-nowrap px-3 py-2.5 font-semibold">Plot number</th>
                    <th className="min-w-52 whitespace-nowrap px-3 py-2.5 font-semibold">Tenant name</th>
                    <th className="min-w-40 whitespace-nowrap px-3 py-2.5 font-semibold">Phone number</th>
                    <th className="min-w-40 whitespace-nowrap px-3 py-2.5 text-right font-semibold">Advance amount</th>
                    <th className="min-w-36 whitespace-nowrap px-3 py-2.5 text-right font-semibold">Monthly rent</th>
                    {yearMonths.map((yearMonth) => (
                      <th
                        key={yearMonth}
                        className={`min-w-36 whitespace-nowrap px-3 py-2.5 text-center font-semibold ${
                          yearMonth === month ? "bg-primary/10" : ""
                        }`}
                      >
                        {formatMonthLabel(yearMonth)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr
                      key={row.unit.id}
                      onClick={() => router.push(`/admin/plots/${row.unit.id}?month=${monthParam}`)}
                      className="cursor-pointer border-t border-primary/5 active:bg-primary-light/60 sm:hover:bg-primary-light/40"
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-foreground">
                        {row.unit.plotNumber}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-foreground/80">
                        {row.unit.tenantName || "Vacant"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-foreground/70">
                        {row.unit.phone || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-foreground/80">
                        ₹{row.unit.advanceAmount.toFixed(0)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-foreground/80">
                        ₹{row.unit.monthlyRent.toFixed(0)}
                      </td>
                      {yearMonths.map((yearMonth) => {
                        const monthlyPayment = row.monthlyPayments.find(
                          (payment) => payment.month === yearMonth
                        );
                        return (
                          <td
                            key={yearMonth}
                            className={`whitespace-nowrap px-3 py-2 text-center ${
                              yearMonth === month ? "bg-primary-light/45" : ""
                            }`}
                          >
                            <StatusBadge
                              status={
                                row.isVacant
                                  ? "VACANT"
                                  : monthlyPayment?.paymentStatus ?? "UNPAID"
                              }
                            />
                            <div className="mt-1 text-xs text-foreground/55">
                              ₹{(monthlyPayment?.amountPaid ?? 0).toFixed(0)} paid
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "paid" | "unpaid" | "partial";
}) {
  const accentClass =
    accent === "paid"
      ? "text-paid"
      : accent === "unpaid"
      ? "text-unpaid"
      : accent === "partial"
      ? "text-partial"
      : "text-primary-dark";
  return (
    <span className="whitespace-nowrap">
      <span className="text-foreground/45">{label} </span>
      <span className={`font-semibold ${accentClass}`}>{value}</span>
    </span>
  );
}

function StatDot() {
  return (
    <span className="text-foreground/20" aria-hidden="true">
      ·
    </span>
  );
}
