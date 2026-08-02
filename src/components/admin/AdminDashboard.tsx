"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import UnitEditorModal from "./UnitEditorModal";
import ChangePasswordModal from "./ChangePasswordModal";
import { getCurrentMonth, getMonthOptions, getPreviousMonth, formatMonthLabel } from "@/lib/month";
import type { DashboardResponse, DashboardRow } from "@/lib/types";

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
  const [editingRow, setEditingRow] = useState<DashboardRow | null | "new">(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
          <>
            {/* Mobile cards */}
            <ul className="flex flex-col gap-2.5 sm:hidden">
              {data.rows.map((row) => (
                <li
                  key={row.unit.id}
                  className="rounded-xl border border-primary/10 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold">Plot {row.unit.plotNumber}</span>
                    <StatusBadge status={row.isVacant ? "VACANT" : row.effectiveStatus} />
                  </div>
                  <p className="mt-1 text-sm text-foreground/60">
                    {row.unit.tenantName || "No tenant"} · {row.unit.phone || "—"}
                  </p>
                  <p className="mt-1 text-sm text-foreground/70">
                    Paid ₹{(row.payment?.amountPaid ?? 0).toFixed(0)} of ₹
                    {(row.payment?.rentAmount ?? row.unit.monthlyRent).toFixed(0)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setEditingRow(row)}
                      className="min-h-10 flex-1 rounded-lg border border-primary/30 px-3 py-2 text-sm font-semibold text-primary-dark"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeactivate(row)}
                      className="min-h-10 rounded-lg border border-unpaid/30 px-3 py-2 text-sm font-semibold text-unpaid"
                    >
                      Deactivate
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-primary/10 bg-white shadow-sm sm:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-primary-light text-primary-dark">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Plot</th>
                    <th className="px-4 py-3 font-semibold">Tenant</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Rent</th>
                    <th className="px-4 py-3 font-semibold">Paid</th>
                    <th className="px-4 py-3 font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.unit.id} className="border-t border-primary/5">
                      <td className="px-4 py-3 font-semibold">{row.unit.plotNumber}</td>
                      <td className="px-4 py-3">{row.unit.tenantName || "—"}</td>
                      <td className="px-4 py-3">{row.unit.phone || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.isVacant ? "VACANT" : row.effectiveStatus} />
                      </td>
                      <td className="px-4 py-3">
                        ₹{(row.payment?.rentAmount ?? row.unit.monthlyRent).toFixed(0)}
                      </td>
                      <td className="px-4 py-3">₹{(row.payment?.amountPaid ?? 0).toFixed(0)}</td>
                      <td className="px-4 py-3">₹{(row.payment?.balanceDue ?? 0).toFixed(0)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingRow(row)}
                            className="rounded-md border border-primary/30 px-2.5 py-1 font-medium text-primary-dark hover:bg-primary-light"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeactivate(row)}
                            className="rounded-md border border-unpaid/30 px-2.5 py-1 font-medium text-unpaid hover:bg-unpaid-bg"
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
