"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MonthYearSelector from "@/components/MonthYearSelector";
import StatusBadge from "@/components/StatusBadge";
import UnitEditorModal from "./UnitEditorModal";
import RentUpdateModal from "./RentUpdateModal";
import ChangePasswordModal from "./ChangePasswordModal";
import {
  getCurrentMonth,
  getMonthOptions,
  getPreviousMonth,
  formatMonthLabel,
  formatDate,
} from "@/lib/month";
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
  const [rentEditRow, setRentEditRow] = useState<DashboardRow | null>(null);
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
      <header className="sticky top-0 z-20 border-b border-primary/10 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-primary-dark sm:text-xl">SJR Rent Tracker</h1>
            <p className="text-xs text-foreground/50">Signed in as {username}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowChangePassword(true)}
              className="min-h-10 rounded-full border border-primary/20 px-3 py-1.5 text-sm font-medium text-primary-dark hover:bg-primary-light"
            >
              Change password
            </button>
            <button
              onClick={handleLogout}
              className="min-h-10 rounded-full border border-primary/20 px-3 py-1.5 text-sm font-medium text-primary-dark hover:bg-primary-light"
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

        {totals && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <TotalCard label="Total plots" value={String(totals.totalUnits)} />
            <TotalCard label="Paid" value={String(totals.numPaid)} accent="paid" />
            <TotalCard label="Partial" value={String(totals.numPartial)} accent="partial" />
            <TotalCard label="Unpaid" value={String(totals.numUnpaid)} accent="unpaid" />
            <TotalCard label="Expected" value={`₹${totals.totalExpected.toFixed(0)}`} />
            <TotalCard label="Outstanding" value={`₹${totals.outstandingBalance.toFixed(0)}`} />
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
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
                  className={`min-h-11 rounded-full border px-3 py-2 text-sm font-medium ${
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
              className="min-h-11 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              + Add plot
            </button>
            <button
              onClick={handleCopyPreviousMonth}
              disabled={copying}
              className="min-h-11 rounded-full border border-primary/30 bg-white px-4 py-2.5 text-sm font-semibold text-primary-dark hover:bg-primary-light disabled:opacity-60"
            >
              {copying ? "Copying..." : "Copy previous month"}
            </button>
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl bg-primary-light" />
            ))}
          </div>
        )}

        {!loading && data && data.rows.length === 0 && (
          <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">
            No plots match your search or filter.
          </div>
        )}

        {!loading && data && data.rows.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.rows.map((row) => (
              <PlotCard
                key={row.unit.id}
                row={row}
                onEditDetails={() => setEditingRow(row)}
                onUpdateRent={() => setRentEditRow(row)}
                onDeactivate={() => handleDeactivate(row)}
              />
            ))}
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

      {rentEditRow && (
        <RentUpdateModal
          row={rentEditRow}
          month={month}
          onClose={() => setRentEditRow(null)}
          onSaved={() => {
            setRentEditRow(null);
            setMessage(`Plot ${rentEditRow.unit.plotNumber} rent updated.`);
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

function PlotCard({
  row,
  onEditDetails,
  onUpdateRent,
  onDeactivate,
}: {
  row: DashboardRow;
  onEditDetails: () => void;
  onUpdateRent: () => void;
  onDeactivate: () => void;
}) {
  const rentAmount = row.payment?.rentAmount ?? row.unit.monthlyRent;
  const maintenanceAmount = row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount;
  const rentSum = rentAmount + maintenanceAmount;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
            Plot {row.unit.plotNumber}
          </p>
          <p className="text-lg font-bold text-foreground">{row.unit.tenantName || "Vacant"}</p>
        </div>
        <StatusBadge status={row.isVacant ? "VACANT" : row.effectiveStatus} />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-foreground/40">Move-in date</dt>
          <dd className="font-medium text-foreground/80">{formatDate(row.unit.moveInDate)}</dd>
        </div>
        <div>
          <dt className="text-foreground/40">Phone</dt>
          <dd className="font-medium text-foreground/80">{row.unit.phone || "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/40">Advance</dt>
          <dd className="font-medium text-foreground/80">₹{row.unit.advanceAmount.toFixed(0)}</dd>
        </div>
        <div>
          <dt className="text-foreground/40">Rent this month</dt>
          <dd className="font-medium text-foreground/80">₹{rentSum.toFixed(0)}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-primary-light/60 p-3 text-sm">
        <div>
          <p className="text-foreground/40">Paid</p>
          <p className="font-semibold text-foreground">₹{(row.payment?.amountPaid ?? 0).toFixed(0)}</p>
        </div>
        <div>
          <p className="text-foreground/40">Balance</p>
          <p className="font-semibold text-foreground">₹{(row.payment?.balanceDue ?? 0).toFixed(0)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-foreground/40">Paid date</p>
          <p className="font-medium text-foreground/80">{formatDate(row.payment?.paidDate ?? null)}</p>
        </div>
        {row.payment?.notes && (
          <div className="col-span-2">
            <p className="text-foreground/40">Notes</p>
            <p className="truncate font-medium text-foreground/80">{row.payment.notes}</p>
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        <button
          onClick={onEditDetails}
          className="min-h-9 flex-1 rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-medium text-primary-dark hover:bg-primary-light"
        >
          Edit record
        </button>
        <button
          onClick={onUpdateRent}
          className="min-h-9 flex-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
        >
          Update rent
        </button>
        <button
          onClick={onDeactivate}
          className="min-h-9 rounded-lg border border-unpaid/30 px-3 py-1.5 text-sm font-medium text-unpaid hover:bg-unpaid-bg"
        >
          Deactivate
        </button>
      </div>
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
