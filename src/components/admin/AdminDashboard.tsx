"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import ChangePasswordModal from "./ChangePasswordModal";
import PlotDetailsModal from "./PlotDetailsModal";
import {
  getCurrentMonth,
  getMonthOptions,
  getPreviousMonth,
  formatMonthLabel,
  formatDate,
  isBeforeMoveInMonth,
} from "@/lib/month";
import type { DashboardResponse, DashboardRow, DashboardTotals, PaymentStatus } from "@/lib/types";
import { stripElectricityNote, withElectricityNote } from "@/lib/notes";
import { computeElectricityAmount, computeElectricityUnits } from "@/lib/electricity";
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
const TABLE_COLUMNS = 9;

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
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-primary/10 bg-white shadow-sm">
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
                  {data.rows.map((row, i) =>
                    inlineEditingId === row.unit.id ? (
                      <EditPanelRow
                        key={row.unit.id}
                        row={row}
                        month={month}
                        onCancel={() => setInlineEditingId(null)}
                        onSaved={(msg) => {
                          setInlineEditingId(null);
                          setMessage(msg);
                          load();
                        }}
                        onError={setError}
                      />
                    ) : (
                      <ReadRow
                        key={row.unit.id}
                        row={row}
                        striped={i % 2 === 1}
                        onEdit={() => setInlineEditingId(row.unit.id)}
                        onDetails={() => setDetailsRow(row)}
                      />
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
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

function EditPanelRow({
  row,
  month,
  onCancel,
  onSaved,
  onError,
}: {
  row: DashboardRow;
  month: string;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const [plotNumber, setPlotNumber] = useState(row.unit.plotNumber);
  const [tenantName, setTenantName] = useState(row.unit.tenantName ?? "");
  const [moveInDate, setMoveInDate] = useState(row.unit.moveInDate?.slice(0, 10) ?? "");
  const [phone, setPhone] = useState(row.unit.phone ?? "");
  const [advanceAmount, setAdvanceAmount] = useState(String(row.unit.advanceAmount));
  const [rent, setRent] = useState(String(row.payment?.rentAmount ?? row.unit.monthlyRent));
  const [maintenance, setMaintenance] = useState(
    String(row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount)
  );
  const [amountPaid, setAmountPaid] = useState(String(row.payment?.amountPaid ?? 0));
  const [paidDate, setPaidDate] = useState(row.payment?.paidDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(stripElectricityNote(row.payment?.notes));
  const [prevReading, setPrevReading] = useState(String(row.payment?.prevReading ?? 0));
  const [currReading, setCurrReading] = useState(String(row.payment?.currReading ?? 0));
  const [electricityPaid, setElectricityPaid] = useState(row.payment?.electricityPaid ?? false);
  const [saving, setSaving] = useState(false);

  const rentNumber = Number(rent || 0);
  const maintenanceNumber = Number(maintenance || 0);
  const rentSum = rentNumber + maintenanceNumber;
  const paidNumber = Number(amountPaid || 0);
  const balanceDue = Math.max(0, rentSum - paidNumber);
  const excessAmount = Math.max(0, paidNumber - rentSum);
  const status: PaymentStatus = paidNumber <= 0 ? "UNPAID" : paidNumber >= rentSum ? "PAID" : "PARTIAL";
  const isBeforeMoveIn = isBeforeMoveInMonth(moveInDate || null, month);

  const prevReadingNumber = Number(prevReading || 0);
  const currReadingNumber = Number(currReading || 0);
  const readingError = currReadingNumber < prevReadingNumber;
  const electricityUnits = computeElectricityUnits(prevReadingNumber, currReadingNumber);
  const electricityAmount = computeElectricityAmount(prevReadingNumber, currReadingNumber);

  const inputClass =
    "min-h-10 w-full rounded-lg border border-primary/25 bg-white px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
  const labelClass = "text-xs font-semibold uppercase tracking-wide text-foreground/45";

  async function save() {
    if (paidNumber > 0 && !paidDate) {
      onError("Enter a paid date when an amount has been paid.");
      return;
    }
    if (readingError) {
      onError("Current meter reading must be greater than or equal to the previous reading.");
      return;
    }
    setSaving(true);
    onError(null);
    try {
      const unitRes = await fetch(`/api/admin/units/${row.unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plotNumber,
          tenantName: tenantName || null,
          moveInDate: moveInDate || null,
          phone: phone || null,
          advanceAmount: Number(advanceAmount || 0),
          monthlyRent: rentNumber,
          maintenanceAmount: maintenanceNumber,
        }),
      });
      const unitJson = await unitRes.json();
      if (!unitRes.ok) throw new Error(unitJson.error ?? "Failed to update plot.");

      const finalNotes = withElectricityNote(notes, excessAmount);

      const paymentRes = await fetch("/api/admin/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: row.unit.id,
          month,
          paymentStatus: status,
          rentAmount: rentNumber,
          maintenanceAmount: maintenanceNumber,
          amountPaid: paidNumber,
          balanceDue,
          paidDate: paidDate || null,
          notes: finalNotes,
          prevReading: prevReadingNumber,
          currReading: currReadingNumber,
          electricityPaid,
        }),
      });
      const paymentJson = await paymentRes.json();
      if (!paymentRes.ok) throw new Error(paymentJson.error ?? "Failed to update payment.");
      onSaved(`Plot ${plotNumber} saved.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save this row.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-t border-primary/10 bg-primary-light/40">
      <td colSpan={TABLE_COLUMNS} className="px-4 py-4 sm:px-5">
        <div className="rounded-2xl border border-primary/15 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-primary-dark">Editing plot {row.unit.plotNumber}</h3>
            <StatusBadge status={isBeforeMoveIn ? "NA" : tenantName.trim() ? status : "VACANT"} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Plot number</span>
              <input required value={plotNumber} onChange={(e) => setPlotNumber(e.target.value)} className={inputClass} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <span className={labelClass}>Tenant name</span>
              <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Joining date</span>
              <input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputClass} />
            </label>
          </div>

          <div className="my-4 border-t border-primary/10" />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Rent (₹)</span>
              <input type="number" min="0" value={rent} onChange={(e) => setRent(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Maintenance (₹)</span>
              <input type="number" min="0" value={maintenance} onChange={(e) => setMaintenance(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Advance (₹)</span>
              <input type="number" min="0" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} className={inputClass} />
            </label>
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Rent sum</span>
              <div className="flex min-h-10 items-center rounded-lg bg-primary-light px-2.5 text-sm font-semibold text-primary-dark">
                ₹{rentSum.toFixed(0)}
              </div>
            </div>
          </div>

          <div className="my-4 border-t border-primary/10" />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Prev reading</span>
              <input
                type="number"
                min="0"
                value={prevReading}
                onChange={(e) => setPrevReading(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Curr reading</span>
              <input
                type="number"
                min="0"
                value={currReading}
                onChange={(e) => setCurrReading(e.target.value)}
                className={`${inputClass} ${readingError ? "border-unpaid focus:border-unpaid focus:ring-unpaid/20" : ""}`}
              />
              {readingError && (
                <p className="text-xs font-medium text-unpaid">Must be ≥ previous reading.</p>
              )}
            </label>
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Electricity (₹)</span>
              <div className="flex min-h-10 items-center rounded-lg bg-primary-light px-2.5 text-sm font-semibold text-primary-dark">
                ₹{electricityAmount.toFixed(0)}
                <span className="ml-1.5 font-normal text-primary-dark/60">({electricityUnits} units)</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Elec. status</span>
              <div className="flex overflow-hidden rounded-lg border border-primary/25">
                <button
                  type="button"
                  onClick={() => setElectricityPaid(true)}
                  className={`min-h-10 flex-1 text-sm font-semibold transition-colors ${
                    electricityPaid ? "bg-paid text-white" : "bg-white text-foreground/60 hover:bg-paid-bg"
                  }`}
                >
                  Paid
                </button>
                <button
                  type="button"
                  onClick={() => setElectricityPaid(false)}
                  className={`min-h-10 flex-1 text-sm font-semibold transition-colors ${
                    !electricityPaid ? "bg-unpaid text-white" : "bg-white text-foreground/60 hover:bg-unpaid-bg"
                  }`}
                >
                  Unpaid
                </button>
              </div>
            </div>
          </div>

          <div className="my-4 border-t border-primary/10" />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Amount paid (₹)</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => {
                    setAmountPaid(String(rentSum));
                    if (!paidDate) setPaidDate(new Date().toISOString().slice(0, 10));
                  }}
                  title="Fill full rent sum as paid"
                  className="min-h-10 shrink-0 whitespace-nowrap rounded-lg border border-paid/40 bg-paid-bg px-2.5 text-xs font-semibold text-paid hover:bg-paid/20"
                >
                  Full
                </button>
              </div>
              {excessAmount > 0 && (
                <p className="text-xs font-medium text-partial">
                  ₹{excessAmount.toFixed(0)} over rent — will be logged in notes as &quot;Paid Electricity&quot;.
                </p>
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Paid date</span>
              <input
                type="date"
                required={paidNumber > 0}
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Balance due</span>
              <div
                className={`flex min-h-10 items-center rounded-lg px-2.5 text-sm font-semibold ${
                  balanceDue > 0 ? "bg-unpaid-bg text-unpaid" : "bg-paid-bg text-paid"
                }`}
              >
                ₹{balanceDue.toFixed(0)}
              </div>
            </div>
            <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <span className={labelClass}>Notes</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={excessAmount > 0 ? "Other notes (optional)" : undefined}
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2 border-t border-primary/10 pt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="min-h-10 rounded-xl border border-primary/20 bg-white px-4 text-sm font-semibold text-foreground/70 hover:bg-primary-light disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || readingError}
              className="min-h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
