"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MonthYearSelector from "@/components/MonthYearSelector";
import ChangePasswordModal from "./ChangePasswordModal";
import { getCurrentMonth, getMonthOptions } from "@/lib/month";
import { computeElectricityAmount, computeElectricityUnits } from "@/lib/electricity";
import type { AdminRole, ElectricityListResponse, ElectricityRow } from "@/lib/types";
import { IconBuilding, IconLock, IconLogout, IconSearch } from "@/components/icons";

const monthOptions = getMonthOptions();

export default function ElectricityDashboard({ username, role }: { username: string; role: AdminRole }) {
  const router = useRouter();
  const [month, setMonth] = useState(getCurrentMonth());
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ElectricityListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ month });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/electricity?${params.toString()}`, { cache: "no-store" });
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const json: ElectricityListResponse = await res.json();
      setData(json);
    } catch {
      setError("Could not load meter readings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [month, search, router]);

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

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-primary/10 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <IconBuilding className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight text-primary-dark sm:text-lg">Meter readings</h1>
              <p className="text-xs text-foreground/45">
                Signed in as {username}
                {role === "SECURITY" ? " · Security" : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {role === "ADMIN" && (
              <Link
                href="/admin"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-primary/20 px-3.5 py-1.5 text-sm font-medium text-primary-dark hover:bg-primary-light"
              >
                Full dashboard
              </Link>
            )}
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

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-3 py-5 sm:px-6">
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

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-primary/10 bg-white p-3 shadow-sm sm:p-4">
          <MonthYearSelector month={month} options={monthOptions} onChange={setMonth} />
          <label className="flex flex-1 min-w-[160px] flex-col gap-1">
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
        </div>

        {loading && (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-primary-light" />
            ))}
          </div>
        )}

        {!loading && data && data.rows.length === 0 && (
          <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">
            No plots match your search.
          </div>
        )}

        {!loading && data && data.rows.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {data.rows.map((row) => (
              <ElectricityRowCard
                key={row.unitId}
                row={row}
                month={month}
                onSaved={(msg) => {
                  setMessage(msg);
                  load();
                }}
                onError={setError}
              />
            ))}
          </ul>
        )}
      </main>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}

function ElectricityRowCard({
  row,
  month,
  onSaved,
  onError,
}: {
  row: ElectricityRow;
  month: string;
  onSaved: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const [prevReading, setPrevReading] = useState(String(row.prevReading));
  const [currReading, setCurrReading] = useState(String(row.currReading));
  const [electricityPaid, setElectricityPaid] = useState(row.electricityPaid);
  const [saving, setSaving] = useState(false);

  const prevReadingNumber = Number(prevReading || 0);
  const currReadingNumber = Number(currReading || 0);
  const readingError = currReadingNumber < prevReadingNumber;
  const electricityAmount = computeElectricityAmount(prevReadingNumber, currReadingNumber);
  const electricityUnits = computeElectricityUnits(prevReadingNumber, currReadingNumber);
  const dirty =
    prevReadingNumber !== row.prevReading || currReadingNumber !== row.currReading || electricityPaid !== row.electricityPaid;

  const inputClass =
    "min-h-10 w-full rounded-lg border border-primary/25 bg-white px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
  const labelClass = "text-xs font-semibold uppercase tracking-wide text-foreground/45";

  async function save() {
    if (readingError) {
      onError("Current meter reading must be greater than or equal to the previous reading.");
      return;
    }
    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/admin/electricity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: row.unitId,
          month,
          prevReading: prevReadingNumber,
          currReading: currReadingNumber,
          electricityPaid,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save reading.");
      onSaved(`Plot ${row.plotNumber} saved.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save this reading.");
    } finally {
      setSaving(false);
    }
  }

  if (row.isBeforeMoveIn) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Plot {row.plotNumber}</p>
          <p className="font-bold text-foreground">{row.tenantName || "Vacant"}</p>
        </div>
        <span className="rounded-full bg-vacant-bg px-3 py-1 text-sm font-semibold text-vacant">N/A</span>
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Plot {row.plotNumber}</p>
          <p className="font-bold text-foreground">{row.tenantName || "Vacant"}</p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-primary/25">
          <button
            type="button"
            onClick={() => setElectricityPaid(true)}
            className={`min-h-9 px-3 text-sm font-semibold transition-colors ${
              electricityPaid ? "bg-paid text-white" : "bg-white text-foreground/60 hover:bg-paid-bg"
            }`}
          >
            Paid
          </button>
          <button
            type="button"
            onClick={() => setElectricityPaid(false)}
            className={`min-h-9 px-3 text-sm font-semibold transition-colors ${
              !electricityPaid ? "bg-unpaid text-white" : "bg-white text-foreground/60 hover:bg-unpaid-bg"
            }`}
          >
            Unpaid
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
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
        </label>
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Electricity (₹)</span>
          <div className="flex min-h-10 items-center rounded-lg bg-primary-light px-2.5 text-sm font-semibold text-primary-dark">
            ₹{electricityAmount.toFixed(0)}
            <span className="ml-1.5 font-normal text-primary-dark/60">({electricityUnits} units)</span>
          </div>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || readingError || !dirty}
          className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {readingError && (
        <p className="mt-1.5 text-xs font-medium text-unpaid">Current reading must be ≥ previous reading.</p>
      )}
    </li>
  );
}
