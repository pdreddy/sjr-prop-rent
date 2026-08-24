"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "@/lib/month";
import type { DashboardResponse, DashboardRow, PaymentStatus } from "@/lib/types";
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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
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

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 py-5 sm:px-6">
        {message && (
          <div className="mb-4 rounded-lg border border-paid/30 bg-paid-bg px-3 py-2 text-sm text-paid">
            {message}
          </div>
        )}
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
            <div className="max-h-[65vh] overflow-auto">
              <table className="text-left text-sm">
                <thead className="sticky top-0 z-20 bg-primary-light text-primary-dark shadow-[0_1px_0_rgba(0,0,0,0.05)]">
                  <tr>
                    <th className="sticky left-0 z-20 w-[64px] min-w-[64px] bg-primary-light px-3 py-2.5 font-semibold">Plot#</th>
                    <th className="sticky left-[64px] z-20 w-[140px] min-w-[140px] border-r border-primary/10 bg-primary-light px-3 py-2.5 font-semibold shadow-[2px_0_4px_rgba(0,0,0,0.04)]">Name</th>
                    <th className="w-[110px] min-w-[110px] px-3 py-2.5 font-semibold">Joining date</th>
                    <th className="w-[90px] min-w-[90px] px-3 py-2.5 font-semibold">Rent</th>
                    <th className="w-[100px] min-w-[100px] px-3 py-2.5 font-semibold">Maintenance</th>
                    <th className="w-[100px] min-w-[100px] px-3 py-2.5 font-semibold">Rent sum</th>
                    <th className="w-[90px] min-w-[90px] px-3 py-2.5 font-semibold">Paid</th>
                    <th className="w-[110px] min-w-[110px] px-3 py-2.5 font-semibold">Paid date</th>
                    <th className="w-[90px] min-w-[90px] px-3 py-2.5 font-semibold">Balance</th>
                    <th className="w-[100px] min-w-[100px] px-3 py-2.5 font-semibold">Status</th>
                    <th className="w-[130px] min-w-[130px] px-3 py-2.5 font-semibold">Phone</th>
                    <th className="w-[180px] min-w-[180px] px-3 py-2.5 font-semibold">Notes</th>
                    <th className="w-[150px] min-w-[150px] px-3 py-2.5 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const rentAmount = row.payment?.rentAmount ?? row.unit.monthlyRent;
                    const maintenanceAmount = row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount;
                    const rentSum = rentAmount + maintenanceAmount;
                    return inlineEditingId === row.unit.id ? (
                      <InlineEditRow
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
                      <tr key={row.unit.id} className="border-t border-primary/5">
                        <td className="sticky left-0 z-10 w-[64px] min-w-[64px] bg-white px-3 py-3 font-semibold text-foreground">
                          {row.unit.plotNumber}
                        </td>
                        <td className="sticky left-[64px] z-10 w-[140px] min-w-[140px] border-r border-primary/10 bg-white px-3 py-3 text-foreground/80 shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                          {row.unit.tenantName || "Vacant"}
                        </td>
                        <td className="w-[110px] min-w-[110px] px-3 py-3 text-foreground/80">
                          {formatDate(row.unit.moveInDate)}
                        </td>
                        <td className="w-[90px] min-w-[90px] px-3 py-3">₹{rentAmount.toFixed(0)}</td>
                        <td className="w-[100px] min-w-[100px] px-3 py-3">₹{maintenanceAmount.toFixed(0)}</td>
                        <td className="w-[100px] min-w-[100px] px-3 py-3 font-medium">₹{rentSum.toFixed(0)}</td>
                        <td className="w-[90px] min-w-[90px] px-3 py-3">₹{(row.payment?.amountPaid ?? 0).toFixed(0)}</td>
                        <td className="w-[110px] min-w-[110px] px-3 py-3 text-foreground/80">
                          {formatDate(row.payment?.paidDate ?? null)}
                        </td>
                        <td className="w-[90px] min-w-[90px] px-3 py-3">₹{(row.payment?.balanceDue ?? 0).toFixed(0)}</td>
                        <td className="w-[100px] min-w-[100px] px-3 py-3">
                          <StatusBadge status={row.isVacant ? "VACANT" : row.effectiveStatus} />
                        </td>
                        <td className="w-[130px] min-w-[130px] px-3 py-3">{row.unit.phone || "—"}</td>
                        <td className="w-[180px] min-w-[180px] truncate px-3 py-3 text-foreground/70">
                          {row.payment?.notes || "—"}
                        </td>
                        <td className="w-[150px] min-w-[150px] px-3 py-3">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setInlineEditingId(row.unit.id)}
                              aria-label={`Edit plot ${row.unit.plotNumber}`}
                              title="Edit row"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 text-primary-dark hover:bg-primary-light"
                            >
                              <IconEdit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDetailsRow(row)}
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
                  })}
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

function InlineEditRow({
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
  const [rent, setRent] = useState(String(row.payment?.rentAmount ?? row.unit.monthlyRent));
  const [maintenance, setMaintenance] = useState(
    String(row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount)
  );
  const [amountPaid, setAmountPaid] = useState(String(row.payment?.amountPaid ?? 0));
  const [paidDate, setPaidDate] = useState(row.payment?.paidDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(row.payment?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const rentNumber = Number(rent || 0);
  const maintenanceNumber = Number(maintenance || 0);
  const rentSum = rentNumber + maintenanceNumber;
  const paidNumber = Number(amountPaid || 0);
  const balanceDue = Math.max(0, rentSum - paidNumber);
  const status: PaymentStatus = paidNumber <= 0 ? "UNPAID" : paidNumber >= rentSum ? "PAID" : "PARTIAL";
  const inputClass =
    "w-full min-w-0 rounded-lg border border-primary/25 bg-white px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30";

  async function save() {
    if (paidNumber > 0 && !paidDate) {
      onError("Enter a paid date when an amount has been paid.");
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
          monthlyRent: rentNumber,
          maintenanceAmount: maintenanceNumber,
        }),
      });
      const unitJson = await unitRes.json();
      if (!unitRes.ok) throw new Error(unitJson.error ?? "Failed to update plot.");

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
          notes: notes || null,
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
    <tr className="border-t border-primary/10 bg-primary-light/40 align-top">
      <td className="sticky left-0 z-10 w-[64px] min-w-[64px] bg-[#f5f8f7] px-2 py-2">
        <input aria-label="Plot number" required value={plotNumber} onChange={(e) => setPlotNumber(e.target.value)} className={inputClass} />
      </td>
      <td className="sticky left-[64px] z-10 w-[140px] min-w-[140px] border-r border-primary/10 bg-[#f5f8f7] px-2 py-2">
        <input aria-label="Tenant name" value={tenantName} onChange={(e) => setTenantName(e.target.value)} className={inputClass} />
      </td>
      <td className="w-[110px] min-w-[110px] px-2 py-2">
        <input aria-label="Joining date" type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} className={inputClass} />
      </td>
      <td className="w-[90px] min-w-[90px] px-2 py-2">
        <input aria-label="Rent" type="number" min="0" value={rent} onChange={(e) => setRent(e.target.value)} className={inputClass} />
      </td>
      <td className="w-[100px] min-w-[100px] px-2 py-2">
        <input aria-label="Maintenance" type="number" min="0" value={maintenance} onChange={(e) => setMaintenance(e.target.value)} className={inputClass} />
      </td>
      <td className="w-[100px] min-w-[100px] px-3 py-3 font-semibold">₹{rentSum.toFixed(0)}</td>
      <td className="w-[90px] min-w-[90px] px-2 py-2">
        <input aria-label="Amount paid" type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className={inputClass} />
      </td>
      <td className="w-[110px] min-w-[110px] px-2 py-2">
        <input aria-label="Paid date" type="date" required={paidNumber > 0} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={inputClass} />
      </td>
      <td className="w-[90px] min-w-[90px] px-3 py-3">₹{balanceDue.toFixed(0)}</td>
      <td className="w-[100px] min-w-[100px] px-3 py-3">
        <StatusBadge status={tenantName.trim() ? status : "VACANT"} />
      </td>
      <td className="w-[130px] min-w-[130px] px-2 py-2">
        <input aria-label="Phone number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
      </td>
      <td className="w-[180px] min-w-[180px] px-2 py-2">
        <input aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
      </td>
      <td className="w-[150px] min-w-[150px] px-2 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="min-h-9 rounded-lg bg-primary px-2.5 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-h-9 rounded-lg border border-primary/25 bg-white px-2.5 py-1.5 text-sm"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
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
