"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import ChangePasswordModal from "./ChangePasswordModal";
import PlotDetailsModal from "./PlotDetailsModal";
import EditPaymentModal from "./EditPaymentModal";
import {
  getCurrentMonth,
  getMonthOptions,
  getPreviousMonth,
  formatMonthLabel,
  formatDate,
} from "@/lib/month";
import type { DashboardResponse, DashboardRow, DashboardTotals } from "@/lib/types";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import {
  IconBuilding,
  IconCopy,
  IconEdit,
  IconInfo,
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
  const [detailsRow, setDetailsRow] = useState<DashboardRow | null | "new">(null);
  const [editingRow, setEditingRow] = useState<DashboardRow | null>(null);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
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
        setMessage(
          json.createdCount > 0
            ? `Copied ${json.createdCount} plot(s) into ${formatMonthLabel(month)}.`
            : `Nothing to copy — every plot already has a record for ${formatMonthLabel(month)}.`
        );
        load();
      } else {
        setError(json.error ?? "Failed to copy previous month.");
      }
    } finally {
      setCopying(false);
    }
  }

  const totals = data?.totals;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-primary/10 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <IconBuilding className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight text-primary-dark sm:text-lg">
                SJR Rent Tracker
              </h1>
              <p className="truncate text-xs text-foreground/45">Signed in as {username}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/electricity"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-primary/20 px-3.5 py-1.5 text-sm font-medium text-primary-dark hover:bg-primary-light"
            >
              <span className="hidden sm:inline">Meter readings</span>
              <span className="sm:hidden">Readings</span>
            </Link>
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

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-3 py-5 sm:px-6">
        {message && (
          <div className="mb-4 rounded-xl border border-paid/30 bg-paid-bg px-3.5 py-2.5 text-sm font-medium text-paid">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">
            {error}
          </div>
        )}

        {totals && <StatsPanel totals={totals} month={month} />}

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
                  className={`min-h-9 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === s
                      ? "border-primary bg-primary text-white"
                      : "border-primary/20 bg-white text-foreground/70 hover:bg-primary-light"
                  }`}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex w-full gap-2 sm:w-auto">
            <button
              onClick={() => setDetailsRow("new")}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark sm:flex-none"
            >
              <IconPlus className="h-4 w-4" />
              Add plot
            </button>
            <button
              onClick={handleCopyPreviousMonth}
              disabled={copying || month <= BUILDING_READY_MONTH}
              title={month <= BUILDING_READY_MONTH ? "No earlier month exists — the building opened this month." : undefined}
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
          <>
            <ul className="flex flex-col gap-2.5 sm:hidden">
              {data.rows.map((row) => (
                <MobileRowCard
                  key={row.unit.id}
                  row={row}
                  onEdit={() => setEditingRow(row)}
                  onDetails={() => setDetailsRow(row)}
                />
              ))}
            </ul>

            <div className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-primary/10 bg-white shadow-sm sm:flex">
              <div className="max-h-[68vh] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-20 bg-primary-dark text-white shadow-[0_1px_0_rgba(0,0,0,0.08)]">
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[150px] bg-primary-dark px-4 py-3 font-semibold">Plot &amp; tenant</th>
                      <th className="min-w-[130px] px-3 py-3 font-semibold">This month</th>
                      <th className="min-w-[110px] px-3 py-3 font-semibold">Status</th>
                      <th className="min-w-[100px] px-3 py-3 font-semibold">Balance</th>
                      <th className="min-w-[150px] px-3 py-3 font-semibold">Electricity</th>
                      <th className="min-w-[170px] px-3 py-3 font-semibold">Notes</th>
                      <th className="min-w-[170px] px-3 py-3 font-semibold">Plot info</th>
                      <th className="min-w-[140px] px-3 py-3 font-semibold">Contact</th>
                      <th className="sticky right-0 z-20 min-w-[100px] bg-primary-dark px-3 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <ReadRow
                        key={row.unit.id}
                        row={row}
                        striped={i % 2 === 1}
                        onEdit={() => setEditingRow(row)}
                        onDetails={() => setDetailsRow(row)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {detailsRow !== null && (
        <PlotDetailsModal
          row={detailsRow === "new" ? null : detailsRow}
          onClose={() => setDetailsRow(null)}
          onSaved={(msg) => {
            setDetailsRow(null);
            setMessage(msg);
            load();
          }}
        />
      )}

      {editingRow && (
        <EditPaymentModal
          row={editingRow}
          month={month}
          onClose={() => setEditingRow(null)}
          onSaved={(msg) => {
            setEditingRow(null);
            setMessage(msg);
            load();
          }}
        />
      )}

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}

function StatsPanel({ totals, month }: { totals: DashboardTotals; month: string }) {
  const collectedPct =
    totals.totalExpected > 0 ? Math.round((totals.totalCollected / totals.totalExpected) * 100) : 0;
  return (
    <div className="mb-4 rounded-2xl border border-primary/10 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground/60">Collections for {formatMonthLabel(month)}</p>
          <p className="mt-1 text-2xl font-bold text-primary-dark">
            ₹{totals.totalCollected.toFixed(0)}
            <span className="text-base font-medium text-foreground/40"> / ₹{totals.totalExpected.toFixed(0)} expected</span>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-primary-light px-3.5 py-1.5 text-sm font-bold text-primary-dark">
          {collectedPct}% collected
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-primary-light">
        <div className="h-full rounded-full bg-paid transition-all" style={{ width: `${Math.min(100, collectedPct)}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label="Plots" value={totals.totalUnits} colorClass="bg-primary-light text-primary-dark" />
        <StatCard label="Paid" value={totals.numPaid} colorClass="bg-paid-bg text-paid" />
        <StatCard label="Partial" value={totals.numPartial} colorClass="bg-partial-bg text-partial" />
        <StatCard label="Unpaid" value={totals.numUnpaid} colorClass="bg-unpaid-bg text-unpaid" />
        <StatCard label="Outstanding" value={`₹${totals.outstandingBalance.toFixed(0)}`} colorClass="bg-vacant-bg text-vacant" />
      </div>
    </div>
  );
}

function StatCard({ label, value, colorClass }: { label: string; value: string | number; colorClass: string }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 text-center ${colorClass}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

function ReadRow({
  row,
  striped,
  onEdit,
  onDetails,
}: {
  row: DashboardRow;
  striped: boolean;
  onEdit: () => void;
  onDetails: () => void;
}) {
  const rentAmount = row.payment?.rentAmount ?? row.unit.monthlyRent;
  const maintenanceAmount = row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount;
  const rentSum = rentAmount + maintenanceAmount;
  const balanceDue = row.payment?.balanceDue ?? 0;
  const status = row.isBeforeMoveIn ? "NA" : row.isVacant ? "VACANT" : row.effectiveStatus;
  const prevReading = row.payment?.prevReading ?? 0;
  const currReading = row.payment?.currReading ?? 0;
  const electricityAmount = row.payment?.electricityAmount ?? 0;
  const electricityStatus = row.isBeforeMoveIn ? "NA" : row.payment?.electricityPaid ? "PAID" : "UNPAID";
  const rowBg = striped ? "bg-primary-light/25" : "bg-white";

  return (
    <tr className={`border-t border-primary/5 align-top transition-colors hover:bg-primary-light/40 ${rowBg}`}>
      <td className={`sticky left-0 z-10 px-4 py-3 ${rowBg}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Plot {row.unit.plotNumber}</p>
        <p className="font-bold text-foreground">{row.unit.tenantName || "Vacant"}</p>
      </td>
      <td className="px-3 py-3">
        <p className="font-semibold text-foreground">₹{rentSum.toFixed(0)} due</p>
        <p className="text-foreground/60">
          ₹{(row.payment?.amountPaid ?? 0).toFixed(0)} paid
          {row.payment?.paidDate ? ` · ${formatDate(row.payment.paidDate)}` : ""}
        </p>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={status} />
      </td>
      <td className="px-3 py-3">
        <span className={`font-semibold ${balanceDue > 0 ? "text-unpaid" : "text-foreground/50"}`}>
          ₹{balanceDue.toFixed(0)}
        </span>
      </td>
      <td className="px-3 py-3">
        {row.isBeforeMoveIn ? (
          <StatusBadge status="NA" />
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground">₹{electricityAmount.toFixed(0)}</span>
              <StatusBadge status={electricityStatus} />
            </div>
            <p className="text-foreground/60">
              {prevReading} → {currReading} ({currReading - prevReading} units)
            </p>
          </>
        )}
      </td>
      <td className="max-w-[200px] whitespace-pre-line px-3 py-3 text-foreground/70 line-clamp-2">{row.payment?.notes || "—"}</td>
      <td className="px-3 py-3 text-foreground/70">
        <p>Joined {formatDate(row.unit.moveInDate)}</p>
        <p>Total rent ₹{rentSum.toFixed(0)}</p>
        <p>Advance ₹{row.unit.advanceAmount.toFixed(0)}</p>
      </td>
      <td className="px-3 py-3 text-foreground/80">{row.unit.phone || "—"}</td>
      <td className={`sticky right-0 z-10 px-3 py-3 ${rowBg}`}>
        <div className="flex justify-end gap-1.5">
          <button
            onClick={onEdit}
            aria-label={`Edit plot ${row.unit.plotNumber}`}
            title="Edit"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 text-primary-dark hover:bg-primary-light"
          >
            <IconEdit className="h-4 w-4" />
          </button>
          <button
            onClick={onDetails}
            aria-label={`Advance amount and deactivate for plot ${row.unit.plotNumber}`}
            title="Advance amount / deactivate"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 text-primary-dark hover:bg-primary-light"
          >
            <IconInfo className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function MobileRowCard({
  row,
  onEdit,
  onDetails,
}: {
  row: DashboardRow;
  onEdit: () => void;
  onDetails: () => void;
}) {
  const rentAmount = row.payment?.rentAmount ?? row.unit.monthlyRent;
  const maintenanceAmount = row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount;
  const rentSum = rentAmount + maintenanceAmount;
  const balanceDue = row.payment?.balanceDue ?? 0;
  const status = row.isBeforeMoveIn ? "NA" : row.isVacant ? "VACANT" : row.effectiveStatus;
  const prevReading = row.payment?.prevReading ?? 0;
  const currReading = row.payment?.currReading ?? 0;
  const electricityAmount = row.payment?.electricityAmount ?? 0;
  const electricityStatus = row.isBeforeMoveIn ? "NA" : row.payment?.electricityPaid ? "PAID" : "UNPAID";

  return (
    <li className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Plot {row.unit.plotNumber}</p>
          <p className="truncate font-bold text-foreground">{row.unit.tenantName || "Vacant"}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-foreground/70">
        <span className="font-semibold text-foreground">₹{rentSum.toFixed(0)} due</span>
        <span>
          ₹{(row.payment?.amountPaid ?? 0).toFixed(0)} paid
          {row.payment?.paidDate ? ` · ${formatDate(row.payment.paidDate)}` : ""}
        </span>
        <span className={`font-semibold ${balanceDue > 0 ? "text-unpaid" : "text-foreground/50"}`}>
          ₹{balanceDue.toFixed(0)} balance
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-background px-3 py-2">
        <div className="min-w-0 text-sm">
          {row.isBeforeMoveIn ? (
            <span className="text-foreground/50">Electricity N/A</span>
          ) : (
            <>
              <span className="font-semibold text-foreground">₹{electricityAmount.toFixed(0)}</span>
              <span className="ml-1.5 text-foreground/50">
                ({prevReading} → {currReading})
              </span>
            </>
          )}
        </div>
        {!row.isBeforeMoveIn && <StatusBadge status={electricityStatus} />}
      </div>

      {row.payment?.notes && (
        <p className="mt-2.5 whitespace-pre-line text-sm text-foreground/60">{row.payment.notes}</p>
      )}

      <div className="mt-3 flex gap-2 border-t border-primary/10 pt-3">
        <button
          onClick={onEdit}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/25 text-sm font-semibold text-primary-dark hover:bg-primary-light"
        >
          <IconEdit className="h-4 w-4" />
          Edit
        </button>
        <button
          onClick={onDetails}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/25 text-sm font-semibold text-primary-dark hover:bg-primary-light"
        >
          <IconInfo className="h-4 w-4" />
          Details
        </button>
      </div>
    </li>
  );
}

