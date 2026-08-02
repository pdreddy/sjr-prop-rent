"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import UnitEditorModal from "./UnitEditorModal";
import ChangePasswordModal from "./ChangePasswordModal";
import {
  getCurrentMonth,
  getMonthOptions,
  getPreviousMonth,
  formatMonthLabel,
  formatDate,
} from "@/lib/month";
import type { DashboardResponse, DashboardRow, PaymentStatus } from "@/lib/types";

const monthOptions = getMonthOptions();
const STATUS_FILTERS = ["ALL", "PAID", "UNPAID", "PARTIAL", "VACANT"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type AdminTableView = "details" | "rent";

export default function AdminDashboard({ username }: { username: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(getCurrentMonth());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<DashboardRow | null | "new">(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [tableView, setTableView] = useState<AdminTableView>("details");

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

  async function handleDeactivate(row: DashboardRow) {
    if (!confirm(`Deactivate Plot ${row.unit.plotNumber}? It will stop appearing in listings.`)) {
      return;
    }
    const res = await fetch(`/api/admin/units/${row.unit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    if (res.ok) {
      setMessage(`Plot ${row.unit.plotNumber} deactivated.`);
      load();
    }
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
        setMessage(`Copied ${json.createdCount} record(s) into ${formatMonthLabel(month)}.`);
        load();
      } else {
        setError(json.error ?? "Failed to copy previous month.");
      }
    } finally {
      setCopying(false);
    }
  }

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const totals = data?.totals;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="bg-primary px-4 py-4 text-white shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold sm:text-xl">SJR Rent Tracker — Admin</h1>
            <p className="text-xs text-white/70">Signed in as {username}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowChangePassword(true)}
              className="min-h-10 rounded-md border border-white/40 px-3 py-1.5 text-sm font-medium hover:bg-white/10"
            >
              Change password
            </button>
            <button
              onClick={handleLogout}
              className="min-h-10 rounded-md border border-white/40 px-3 py-1.5 text-sm font-medium hover:bg-white/10"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
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

        <div className="mb-5 flex flex-wrap items-end gap-3">
          <MonthYearSelector month={month} options={monthOptions} onChange={setMonth} />

          <label className="flex flex-1 min-w-[200px] flex-col gap-1">
            <span className="text-sm font-medium text-primary-dark">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Plot number, tenant or phone"
              className="min-h-11 rounded-lg border border-primary/20 bg-white px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-primary-dark">Filter</span>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium ${
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

          <div className="flex gap-2">
            <button
              onClick={() => setEditingRow("new")}
              className="min-h-11 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              + Add plot
            </button>
            <button
              onClick={handleCopyPreviousMonth}
              disabled={copying}
              className="min-h-11 rounded-lg border border-primary/30 bg-white px-4 py-2.5 text-sm font-semibold text-primary-dark hover:bg-primary-light disabled:opacity-60"
            >
              {copying ? "Copying..." : "Copy previous month"}
            </button>
          </div>
        </div>

        {totals && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <TotalCard label="Total plots" value={String(totals.totalUnits)} />
            <TotalCard label="Paid" value={String(totals.numPaid)} accent="paid" />
            <TotalCard label="Partial" value={String(totals.numPartial)} accent="partial" />
            <TotalCard label="Unpaid" value={String(totals.numUnpaid)} accent="unpaid" />
            <TotalCard label="Expected" value={`₹${totals.totalExpected.toFixed(0)}`} />
            <TotalCard label="Outstanding" value={`₹${totals.outstandingBalance.toFixed(0)}`} />
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-primary-light" />
            ))}
          </div>
        )}

        {!loading && data && data.rows.length === 0 && (
          <div className="rounded-xl border border-primary/15 bg-white p-8 text-center text-foreground/60">
            No plots match your search or filter.
          </div>
        )}

        {!loading && data && data.rows.length > 0 && (
          <div>
            <div className="mb-3 flex gap-2" role="tablist" aria-label="Admin table view">
              <button type="button" role="tab" aria-selected={tableView === "details"} onClick={() => setTableView("details")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tableView === "details" ? "bg-primary text-white" : "border border-primary/20 bg-white text-primary-dark"}`}>Tenant details</button>
              <button type="button" role="tab" aria-selected={tableView === "rent"} onClick={() => setTableView("rent")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tableView === "rent" ? "bg-primary text-white" : "border border-primary/20 bg-white text-primary-dark"}`}>Update rent</button>
            </div>
          <div className="overflow-x-auto rounded-xl border border-primary/10 bg-white shadow-sm">
            <table className="text-left text-sm">
              {tableView === "details" ? (
                <thead className="bg-primary-light text-primary-dark">
                  <tr>
                    <th className="sticky left-0 z-10 w-[64px] min-w-[64px] bg-primary-light px-3 py-3 font-semibold">Plot#</th>
                    <th className="sticky left-[64px] z-10 w-[160px] min-w-[160px] border-r border-primary/10 bg-primary-light px-3 py-3 font-semibold shadow-[2px_0_4px_rgba(0,0,0,0.04)]">Name</th>
                    <th className="w-[120px] min-w-[120px] px-3 py-3 font-semibold">Advance</th>
                    <th className="w-[110px] min-w-[110px] px-3 py-3 font-semibold">Move-in date</th>
                    <th className="w-[140px] min-w-[140px] px-3 py-3 font-semibold">Phone</th>
                    <th className="w-[170px] min-w-[170px] px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
              ) : (
                <thead className="bg-primary-light text-primary-dark">
                  <tr>
                    <th className="sticky left-0 z-10 w-[64px] min-w-[64px] bg-primary-light px-3 py-3 font-semibold">Plot#</th>
                    <th className="sticky left-[64px] z-10 w-[140px] min-w-[140px] border-r border-primary/10 bg-primary-light px-3 py-3 font-semibold shadow-[2px_0_4px_rgba(0,0,0,0.04)]">Name</th>
                    <th className="w-[90px] min-w-[90px] px-3 py-3 font-semibold">Rent</th>
                    <th className="w-[100px] min-w-[100px] px-3 py-3 font-semibold">Maintenance</th>
                    <th className="w-[100px] min-w-[100px] px-3 py-3 font-semibold">Rent sum</th>
                    <th className="w-[90px] min-w-[90px] px-3 py-3 font-semibold">Paid</th>
                    <th className="w-[110px] min-w-[110px] px-3 py-3 font-semibold">Paid date</th>
                    <th className="w-[90px] min-w-[90px] px-3 py-3 font-semibold">Balance</th>
                    <th className="w-[100px] min-w-[100px] px-3 py-3 font-semibold">Status</th>
                    <th className="w-[180px] min-w-[180px] px-3 py-3 font-semibold">Notes</th>
                    <th className="w-[150px] min-w-[150px] px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {data.rows.map((row) => {
                  const rentAmount = row.payment?.rentAmount ?? row.unit.monthlyRent;
                  const maintenanceAmount =
                    row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount;
                  const rentSum = rentAmount + maintenanceAmount;

                  if (tableView === "details") {
                    return (
                      <tr key={row.unit.id} className="border-t border-primary/5">
                        <td className="sticky left-0 z-10 w-[64px] min-w-[64px] bg-white px-3 py-3 font-semibold text-foreground">
                          {row.unit.plotNumber}
                        </td>
                        <td className="sticky left-[64px] z-10 w-[160px] min-w-[160px] border-r border-primary/10 bg-white px-3 py-3 shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                          {row.unit.tenantName || "—"}
                        </td>
                        <td className="w-[120px] min-w-[120px] px-3 py-3">
                          ₹{row.unit.advanceAmount.toFixed(0)}
                        </td>
                        <td className="w-[110px] min-w-[110px] px-3 py-3 text-foreground/80">
                          {formatDate(row.unit.moveInDate)}
                        </td>
                        <td className="w-[140px] min-w-[140px] px-3 py-3">
                          {row.unit.phone || "—"}
                        </td>
                        <td className="w-[170px] min-w-[170px] px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingRow(row)}
                              className="min-h-9 rounded-md border border-primary/30 px-2.5 py-1 font-medium text-primary-dark hover:bg-primary-light"
                            >
                              Edit record
                            </button>
                            <button
                              onClick={() => handleDeactivate(row)}
                              className="min-h-9 rounded-md border border-unpaid/30 px-2.5 py-1 font-medium text-unpaid hover:bg-unpaid-bg"
                            >
                              Deactivate
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (inlineEditingId === row.unit.id) {
                    return (
                      <InlineEditRow
                        key={row.unit.id}
                        row={row}
                        month={month}
                        onCancel={() => setInlineEditingId(null)}
                        onSaved={() => {
                          setInlineEditingId(null);
                          setMessage(`Plot ${row.unit.plotNumber} saved.`);
                          load();
                        }}
                        onError={setError}
                      />
                    );
                  }
                  return (
                    <tr key={row.unit.id} className="border-t border-primary/5">
                      <td className="sticky left-0 z-10 w-[64px] min-w-[64px] bg-white px-3 py-3 font-semibold text-foreground">
                        {row.unit.plotNumber}
                      </td>
                      <td className="sticky left-[64px] z-10 w-[140px] min-w-[140px] border-r border-primary/10 bg-white px-3 py-3 shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                        {row.unit.tenantName || "—"}
                      </td>
                      <td className="w-[90px] min-w-[90px] px-3 py-3">₹{rentAmount.toFixed(0)}</td>
                      <td className="w-[100px] min-w-[100px] px-3 py-3">
                        ₹{maintenanceAmount.toFixed(0)}
                      </td>
                      <td className="w-[100px] min-w-[100px] px-3 py-3 font-medium">
                        ₹{rentSum.toFixed(0)}
                      </td>
                      <td className="w-[90px] min-w-[90px] px-3 py-3">
                        ₹{(row.payment?.amountPaid ?? 0).toFixed(0)}
                      </td>
                      <td className="w-[110px] min-w-[110px] px-3 py-3 text-foreground/80">{formatDate(row.payment?.paidDate ?? null)}</td>
                      <td className="w-[90px] min-w-[90px] px-3 py-3">
                        ₹{(row.payment?.balanceDue ?? 0).toFixed(0)}
                      </td>
                      <td className="w-[100px] min-w-[100px] px-3 py-3">
                        <StatusBadge status={row.isVacant ? "VACANT" : row.effectiveStatus} />
                      </td>
                      <td className="w-[180px] min-w-[180px] truncate px-3 py-3 text-foreground/70">
                        {row.payment?.notes || "—"}
                      </td>
                      <td className="w-[150px] min-w-[150px] px-3 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setInlineEditingId(row.unit.id)}
                            className="min-h-9 rounded-md border border-primary/30 px-2.5 py-1 font-medium text-primary-dark hover:bg-primary-light"
                          >
                            Edit row
                          </button>
                          <button
                            onClick={() => handleDeactivate(row)}
                            className="min-h-9 rounded-md border border-unpaid/30 px-2.5 py-1 font-medium text-unpaid hover:bg-unpaid-bg"
                          >
                            Deactivate
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

      {editingRow !== null && (
        <UnitEditorModal
          row={editingRow === "new" ? null : editingRow}
          month={month}
          onClose={() => setEditingRow(null)}
          onSaved={() => {
            setEditingRow(null);
            setMessage("Saved successfully.");
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
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [rent, setRent] = useState(String(row.payment?.rentAmount ?? row.unit.monthlyRent));
  const [maintenance, setMaintenance] = useState(String(row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount));
  const [amountPaid, setAmountPaid] = useState(String(row.payment?.amountPaid ?? 0));
  const [paidDate, setPaidDate] = useState(row.payment?.paidDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(row.payment?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const rentNumber = Number(rent || 0);
  const maintenanceNumber = Number(maintenance || 0);
  const paidNumber = Number(amountPaid || 0);
  const rentSum = rentNumber + maintenanceNumber;
  const balanceDue = Math.max(0, rentSum - paidNumber);
  const status: PaymentStatus = paidNumber <= 0 ? "UNPAID" : paidNumber >= rentSum ? "PAID" : "PARTIAL";
  const inputClass = "w-full min-w-0 rounded border border-primary/25 bg-white px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30";

  async function save() {
    if (paidNumber > 0 && !paidDate) {
      onError("Enter a paid date when an amount has been paid.");
      return;
    }
    setSaving(true);
    onError(null);
    try {
      const unitResponse = await fetch(`/api/admin/units/${row.unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyRent: rentNumber,
          maintenanceAmount: maintenanceNumber,
        }),
      });
      const unitJson = await unitResponse.json();
      if (!unitResponse.ok) throw new Error(unitJson.error ?? "Failed to update plot.");

      const paymentResponse = await fetch("/api/admin/payments", {
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
      const paymentJson = await paymentResponse.json();
      if (!paymentResponse.ok) throw new Error(paymentJson.error ?? "Failed to update payment.");
      onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save this row.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-t border-primary/10 bg-primary-light/35 align-top">
      <td className="sticky left-0 z-10 bg-[#f5f8f7] px-3 py-3 font-semibold">{row.unit.plotNumber}</td>
      <td className="sticky left-[64px] z-10 border-r border-primary/10 bg-[#f5f8f7] px-3 py-3">{row.unit.tenantName || "—"}</td>
      <td className="px-2 py-2"><input aria-label="Rent" type="number" min="0" value={rent} onChange={(e) => setRent(e.target.value)} className={inputClass} /></td>
      <td className="px-2 py-2"><input aria-label="Maintenance" type="number" min="0" value={maintenance} onChange={(e) => setMaintenance(e.target.value)} className={inputClass} /></td>
      <td className="px-3 py-3 font-semibold">₹{rentSum.toFixed(0)}</td>
      <td className="px-2 py-2"><input aria-label="Amount paid" type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className={inputClass} /></td>
      <td className="px-2 py-2"><input aria-label="Paid date" type="date" required={paidNumber > 0} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={inputClass} /></td>
      <td className="px-3 py-3">₹{balanceDue.toFixed(0)}</td>
      <td className="px-3 py-3"><StatusBadge status={row.unit.tenantName?.trim() ? status : "VACANT"} /></td>
      <td className="px-2 py-2"><input aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></td>
      <td className="px-2 py-2">
        <div className="flex gap-1">
          <button type="button" onClick={save} disabled={saving} className="min-h-9 rounded-md bg-primary px-2.5 py-1 font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onCancel} disabled={saving} className="min-h-9 rounded-md border border-primary/25 bg-white px-2.5 py-1">Cancel</button>
        </div>
      </td>
    </tr>
  );
}

function TotalCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
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
    <div className="rounded-xl border border-primary/10 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-foreground/50">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accentClass}`}>{value}</p>
    </div>
  );
}
