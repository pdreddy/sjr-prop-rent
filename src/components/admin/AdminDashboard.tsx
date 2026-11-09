"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import ChangePasswordModal from "./ChangePasswordModal";
import PlotDetailsModal from "./PlotDetailsModal";
import EditPaymentModal from "./EditPaymentModal";
import ElectricityStatementView from "./ElectricityStatementView";
import RentalHistoryView from "./RentalHistoryView";
import MoveInProrationView from "./MoveInProrationView";
import RentPaidView from "./RentPaidView";
import PaymentHistoryView from "./PaymentHistoryView";
import AllDetailsView from "./AllDetailsView";
import SettingsView from "./SettingsView";
import SummaryView from "./SummaryView";
import {
  getCurrentMonth,
  getMonthOptions,
  getPreviousMonth,
  formatMonthLabel,
  formatDate,
} from "@/lib/month";
import type { DashboardResponse, DashboardRow, DashboardTotals } from "@/lib/types";
import { BUILDING_READY_MONTH, ELECTRICITY_RATE_PER_UNIT } from "@/lib/constants";
import { computeElectricityUnits } from "@/lib/electricity";
import { rupee } from "@/lib/format";
import {
  IconBolt,
  IconBuilding,
  IconCopy,
  IconGrid,
  IconSettings,
  IconUser,
  IconWallet,
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
type Tab = "overview" | "summary" | "all-details" | "electricity" | "history" | "proration" | "rent-paid" | "payment-history" | "settings";
const TAB_LABELS: Record<Tab, string> = { overview: "Overview", summary: "Summary", "all-details": "All details", electricity: "Electricity bills", history: "Rental history", proration: "Move-in proration", "rent-paid": "Rent paid", "payment-history": "Payment history", settings: "Settings" };

// Navigation: eight screens grouped into five sections (sidebar on desktop, bottom bar on phones).
const NAV_GROUPS: { id: string; label: string; icon: typeof IconGrid; tabs: Tab[] }[] = [
  { id: "overview", label: "Overview", icon: IconGrid, tabs: ["overview", "summary"] },
  { id: "electricity", label: "Electricity", icon: IconBolt, tabs: ["electricity"] },
  { id: "payments", label: "Payments", icon: IconWallet, tabs: ["payment-history", "rent-paid", "proration"] },
  { id: "plots", label: "Plots", icon: IconUser, tabs: ["all-details", "history"] },
  { id: "settings", label: "Settings", icon: IconSettings, tabs: ["settings"] },
];

export default function AdminDashboard({ username }: { username: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
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

  const handleUnauthorized = useCallback(() => router.push("/admin/login"), [router]);

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
  // These tabs load their own data and ignore the month/search/filter bar.
  const standaloneTab = tab === "summary" || tab === "electricity" || tab === "history" || tab === "proration" || tab === "rent-paid" || tab === "payment-history" || tab === "settings";

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary text-white">
              <IconBuilding className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight text-ink sm:text-lg">
                SJR Rent Tracker
              </h1>
              <p className="truncate text-xs text-foreground/45">Signed in as {username}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/electricity"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-primary-light"
            >
              <span className="hidden sm:inline">Meter readings</span>
              <span className="sm:hidden">Readings</span>
            </Link>
            <button
              onClick={() => setShowChangePassword(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-primary-light"
            >
              <IconLock className="h-4 w-4" />
              <span className="hidden sm:inline">Change password</span>
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-primary-light"
            >
              <IconLogout className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-3 sm:px-6">
      <aside className="hidden w-52 shrink-0 md:block">
        <nav aria-label="Sections" className="sticky top-20 flex flex-col gap-4 py-5">
          {NAV_GROUPS.map((g) => (
            <div key={g.id}>
              <button
                onClick={() => setTab(g.tabs[0])}
                className={`flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-sm font-semibold transition-colors ${g.tabs.includes(tab) ? "bg-primary text-white" : "text-ink hover:bg-primary-light"}`}
              >
                <g.icon className="h-4 w-4" />
                {g.label}
              </button>
              {g.tabs.length > 1 && (
                <ul className="mt-1 ml-5 flex flex-col border-l border-line pl-2">
                  {g.tabs.map((t) => (
                    <li key={t}>
                      <button
                        onClick={() => setTab(t)}
                        className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${tab === t ? "bg-primary-light font-semibold text-ink" : "text-muted hover:text-ink"}`}
                      >
                        {TAB_LABELS[t]}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col py-5 pb-24 md:pb-5">
        {message && (
          <div className="mb-4 rounded-control border border-paid/30 bg-paid-bg px-3.5 py-2.5 text-sm font-medium text-paid">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-control border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">
            {error}
          </div>
        )}

        {(() => {
          const group = NAV_GROUPS.find((g) => g.tabs.includes(tab));
          return group && group.tabs.length > 1 ? (
            <div className="mb-4 flex gap-1.5 overflow-x-auto md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {group.tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${tab === t ? "border-primary bg-primary text-white" : "border-line-strong bg-white text-muted"}`}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          ) : null;
        })()}

        {tab === "overview" && totals && <StatsPanel totals={totals} month={month} />}

        {tab === "summary" && <SummaryView onUnauthorized={handleUnauthorized} />}
        {tab === "electricity" && <ElectricityStatementView onUnauthorized={handleUnauthorized} />}
        {tab === "history" && <RentalHistoryView onUnauthorized={handleUnauthorized} onChanged={load} />}
        {tab === "proration" && <MoveInProrationView onUnauthorized={handleUnauthorized} />}
        {tab === "rent-paid" && <RentPaidView onUnauthorized={handleUnauthorized} />}
        {tab === "payment-history" && <PaymentHistoryView onUnauthorized={handleUnauthorized} />}
        {tab === "settings" && <SettingsView onUnauthorized={handleUnauthorized} onNotify={(msg) => { setMessage(msg); load(); }} />}

        <div className={`mb-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-white p-3 shadow-card sm:p-4 ${standaloneTab ? "hidden" : ""}`}>
          <MonthYearSelector month={month} options={monthOptions} onChange={setMonth} />

          <label className="flex flex-1 min-w-[160px] flex-col gap-1">
            <span className="label-caps">Search</span>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Plot, tenant or phone"
                className="min-h-11 w-full rounded-control border border-line-strong bg-white py-2 pl-9 pr-3 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </label>

          <div className="flex w-full flex-col gap-1 sm:w-auto">
            <span className="label-caps">Filter</span>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`min-h-9 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === s
                      ? "border-primary bg-primary text-white"
                      : "border-line-strong bg-white text-foreground/70 hover:bg-primary-light"
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
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-primary-light disabled:opacity-60 sm:flex-none"
            >
              <IconCopy className="h-4 w-4" />
              {copying ? "Copying..." : "Copy last month"}
            </button>
          </div>
        </div>

        {loading && !standaloneTab && (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-control bg-primary-light" />
            ))}
          </div>
        )}

        {!loading && data && tab === "overview" && data.rows.length === 0 && (
          <div className="rounded-card border border-line bg-white p-8 text-center text-foreground/60">
            No plots match your search or filter.
          </div>
        )}

        {!loading && data && tab === "overview" && data.rows.length > 0 && (
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

            <div className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-white shadow-card sm:flex">
              <div className="max-h-[68vh] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-20 bg-primary-light text-muted shadow-[0_1px_0_var(--color-line)]">
                    <tr>
                      <th className="label-caps sticky left-0 z-20 min-w-[170px] bg-primary-light px-4 py-3">Plot &amp; tenant</th>
                      <th className="label-caps min-w-[170px] px-3 py-3">Rent</th>
                      <th className="label-caps min-w-[190px] px-3 py-3">Electricity</th>
                      <th className="label-caps min-w-[110px] px-3 py-3">Status</th>
                      <th className="label-caps sticky right-0 z-20 min-w-[100px] bg-primary-light px-3 py-3 text-right">Actions</th>
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

        {!loading && data && tab === "all-details" && (
          <AllDetailsView
            rows={data.rows}
            month={month}
            onSaved={(msg) => {
              setMessage(msg);
              load();
            }}
            onError={setError}
          />
        )}
      </main>
      </div>

      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV_GROUPS.map((g) => {
          const active = g.tabs.includes(tab);
          return (
            <button
              key={g.id}
              onClick={() => setTab(active ? tab : g.tabs[0])}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-primary" : "text-muted"}`}
            >
              <g.icon className="h-5 w-5" />
              {g.label}
            </button>
          );
        })}
      </nav>

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
          ratePerUnit={data?.electricityConfig ?? data?.electricityRatePerUnit ?? ELECTRICITY_RATE_PER_UNIT}
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
    <div className="mb-4 rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-caps">Collections for {formatMonthLabel(month)}</p>
          <p className="money-lg mt-1">
            {rupee(totals.totalCollected)}
            <span className="text-base font-medium text-muted"> / {rupee(totals.totalExpected)} expected</span>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-primary-light px-3.5 py-1.5 text-sm font-bold text-ink">
          {collectedPct}% collected
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-primary-light">
        <div className="h-full rounded-full bg-paid transition-all" style={{ width: `${Math.min(100, collectedPct)}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label="Tenants" value={totals.totalUnits} colorClass="bg-primary-light text-ink" />
        <StatCard label="Paid" value={totals.numPaid} colorClass="bg-paid-bg text-paid" />
        <StatCard label="Partial" value={totals.numPartial} colorClass="bg-partial-bg text-partial" />
        <StatCard label="Unpaid" value={totals.numUnpaid} colorClass="bg-unpaid-bg text-unpaid" />
        <StatCard label="Outstanding" value={rupee(totals.outstandingBalance)} colorClass="bg-vacant-bg text-vacant col-span-2 sm:col-span-1" />
      </div>
    </div>
  );
}

function StatCard({ label, value, colorClass }: { label: string; value: string | number; colorClass: string }) {
  return (
    <div className={`rounded-control px-3 py-2.5 text-center ${colorClass}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

type Attention = "bad" | "warn" | null;
/** Rows that need the owner's eye: unpaid or partial rent, or unpaid electricity. */
function attentionOf(row: DashboardRow): Attention {
  if (row.isVacant || row.isBeforeMoveIn) return null;
  if (row.effectiveStatus === "UNPAID") return "bad";
  if (row.effectiveStatus === "PARTIAL") return "warn";
  if ((row.payment?.electricityAmount ?? 0) > 0 && !row.payment?.electricityPaid) return "warn";
  return null;
}
const ATTENTION_EDGE: Record<"bad" | "warn", string> = {
  bad: "shadow-[inset_4px_0_0_var(--color-unpaid)]",
  warn: "shadow-[inset_4px_0_0_var(--color-partial)]",
};

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
  const rentAmount = row.payment?.rentAmount ?? row.expectedRent;
  const maintenanceAmount = row.payment?.maintenanceAmount ?? row.expectedMaintenance;
  const rentSum = rentAmount + maintenanceAmount;
  const balanceDue = row.payment?.balanceDue ?? 0;
  const status = row.isBeforeMoveIn ? "NA" : row.isVacant ? "VACANT" : row.effectiveStatus;
  const prevReading = row.payment?.prevReading ?? 0;
  const currReading = row.payment?.currReading ?? 0;
  const electricityAmount = row.payment?.electricityAmount ?? 0;
  const electricityStatus = row.isBeforeMoveIn ? "NA" : row.payment?.electricityPaid ? "PAID" : "UNPAID";
  const rowBg = striped ? "bg-primary-light/40" : "bg-white";
  const attention = attentionOf(row);

  return (
    <tr className={`border-t border-line align-top transition-colors hover:bg-primary-light ${rowBg}`}>
      <td className={`sticky left-0 z-10 px-4 py-3 ${rowBg} ${attention ? ATTENTION_EDGE[attention] : ""}`}>
        <p className="label-caps">Plot {row.unit.plotNumber}</p>
        <p className="font-bold text-ink">{row.unit.tenantName || "Vacant"}</p>
      </td>
      <td className="px-3 py-3">
        {row.isVacant || row.isBeforeMoveIn ? (
          <span className="text-foreground/35">—</span>
        ) : (
          <>
            <p className="money">{rupee(rentSum)}</p>
            <p className="text-muted">
              {rupee(row.payment?.amountPaid ?? 0)} paid
              {row.payment?.paidDate ? ` · ${formatDate(row.payment.paidDate)}` : ""}
            </p>
            {balanceDue > 0 && <p className="font-semibold text-unpaid">{rupee(balanceDue)} balance</p>}
          </>
        )}
      </td>
      <td className="px-3 py-3">
        {row.isBeforeMoveIn ? (
          <StatusBadge status="NA" />
        ) : row.isVacant ? (
          <span className="text-foreground/35">—</span>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="money">{rupee(electricityAmount)}</span>
              <StatusBadge status={electricityStatus} />
            </div>
            <p className="text-muted">
              {prevReading} → {currReading} ({computeElectricityUnits(prevReading, currReading)} units)
            </p>
          </>
        )}
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={status} />
      </td>
      <td className={`sticky right-0 z-10 px-3 py-3 ${rowBg}`}>
        <div className="flex justify-end gap-1.5">
          <button
            onClick={onEdit}
            aria-label={`Edit plot ${row.unit.plotNumber}`}
            title="Edit"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-white text-ink hover:bg-primary-light"
          >
            <IconEdit className="h-4 w-4" />
          </button>
          <button
            onClick={onDetails}
            aria-label={`Plot details for plot ${row.unit.plotNumber}`}
            title="Plot details (joined date, rent, notes) and deactivate"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-white text-ink hover:bg-primary-light"
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
  const rentAmount = row.payment?.rentAmount ?? row.expectedRent;
  const maintenanceAmount = row.payment?.maintenanceAmount ?? row.expectedMaintenance;
  const rentSum = rentAmount + maintenanceAmount;
  const balanceDue = row.payment?.balanceDue ?? 0;
  const status = row.isBeforeMoveIn ? "NA" : row.isVacant ? "VACANT" : row.effectiveStatus;
  const prevReading = row.payment?.prevReading ?? 0;
  const currReading = row.payment?.currReading ?? 0;
  const electricityAmount = row.payment?.electricityAmount ?? 0;
  const electricityStatus = row.isBeforeMoveIn ? "NA" : row.payment?.electricityPaid ? "PAID" : "UNPAID";

  return (
    <li className={`rounded-card border border-line bg-white p-4 shadow-card ${attentionOf(row) === "bad" ? "border-l-4 border-l-unpaid" : attentionOf(row) === "warn" ? "border-l-4 border-l-partial" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="label-caps">Plot {row.unit.plotNumber}</p>
          <p className="truncate font-bold text-foreground">{row.unit.tenantName || "Vacant"}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {row.isVacant ? (
        <p className="mt-2.5 text-sm text-foreground/50">No tenant. Nothing due.</p>
      ) : (
      <>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-foreground/70">
        <span className="font-semibold text-foreground">{rupee(rentSum)} due</span>
        <span>
          {rupee((row.payment?.amountPaid ?? 0))} paid
          {row.payment?.paidDate ? ` · ${formatDate(row.payment.paidDate)}` : ""}
        </span>
        <span className={`font-semibold ${balanceDue > 0 ? "text-unpaid" : "text-foreground/50"}`}>
          {rupee(balanceDue)} balance
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-control bg-background px-3 py-2">
        <div className="min-w-0 text-sm">
          {row.isBeforeMoveIn ? (
            <span className="text-foreground/50">Electricity N/A</span>
          ) : (
            <>
              <span className="font-semibold text-foreground">{rupee(electricityAmount)}</span>
              <span className="ml-1.5 text-foreground/50">
                ({prevReading} → {currReading})
              </span>
            </>
          )}
        </div>
        {!row.isBeforeMoveIn && <StatusBadge status={electricityStatus} />}
      </div>
      </>
      )}

      {row.payment?.notes && (
        <p className="mt-2.5 whitespace-pre-line text-sm text-foreground/60">{row.payment.notes}</p>
      )}

      <div className="mt-3 flex gap-2 border-t border-line pt-3">
        <button
          onClick={onEdit}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong text-sm font-semibold text-ink hover:bg-primary-light"
        >
          <IconEdit className="h-4 w-4" />
          Edit
        </button>
        <button
          onClick={onDetails}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong text-sm font-semibold text-ink hover:bg-primary-light"
        >
          <IconInfo className="h-4 w-4" />
          Details
        </button>
      </div>
    </li>
  );
}

