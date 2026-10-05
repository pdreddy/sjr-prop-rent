"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MonthYearSelector from "@/components/MonthYearSelector";
import ChangePasswordModal from "./ChangePasswordModal";
import { formatMonthLabel, getCurrentMonth, getMonthOptions } from "@/lib/month";
import { ELECTRICITY_RATE_PER_UNIT } from "@/lib/constants";
import { parseReadings } from "@/lib/readings";
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
  // Only the very first load shows the full skeleton — a reload after saving a row
  // (or changing month/search) keeps the existing list mounted so open inputs don't
  // lose focus/cursor position and the page doesn't jump while it re-fetches.
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
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
      hasLoadedRef.current = true;
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

  const totals = useMemo(() => {
    if (!data) return null;
    return data.rows.reduce(
      (acc, row) => {
        acc.amount += row.electricityAmount;
        acc.paid += row.electricityPaid ? row.electricityAmount : 0;
        return acc;
      },
      { amount: 0, paid: 0 }
    );
  }, [data]);

  // Plots whose current reading has already been entered this month sink to the
  // bottom, so the still-pending plots stay together at the top — no scrolling
  // hunt for the next one to fill in after each save.
  const sortedRows = useMemo(() => {
    if (!data) return [];
    const pending = data.rows.filter((row) => row.currReading <= row.prevReading);
    const recorded = data.rows.filter((row) => row.currReading > row.prevReading);
    return [...pending, ...recorded];
  }, [data]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-primary/10 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <IconBuilding className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight text-primary-dark sm:text-lg">Meter readings</h1>
              <p className="truncate text-xs text-foreground/45">
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
        {role === "ADMIN" && data && (
          <RateEditor
            key={data.ratePerUnit}
            ratePerUnit={data.ratePerUnit}
            onSaved={(msg) => {
              setMessage(msg);
              load();
            }}
            onError={setError}
          />
        )}

        {data && (
          <BulkEntry
            month={month}
            rows={data.rows}
            ratePerUnit={data.ratePerUnit ?? ELECTRICITY_RATE_PER_UNIT}
            onDone={(msg) => {
              setMessage(msg);
              load();
            }}
            onError={setError}
          />
        )}

        {totals && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-white p-3.5 shadow-sm sm:p-4">
            <div>
              <p className="text-sm font-medium text-foreground/60">
                Total electricity for {formatMonthLabel(month)}
              </p>
              <p className="mt-1 text-2xl font-bold text-primary-dark">₹{totals.amount.toFixed(0)}</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-paid-bg px-3.5 py-1.5 text-sm font-bold text-paid">
              ₹{totals.paid.toFixed(0)} paid
            </div>
          </div>
        )}

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
            {sortedRows.map((row) => (
              <ElectricityRowCard
                key={row.unitId}
                row={row}
                month={month}
                ratePerUnit={data.ratePerUnit ?? ELECTRICITY_RATE_PER_UNIT}
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
  ratePerUnit,
  onSaved,
  onError,
}: {
  row: ElectricityRow;
  month: string;
  ratePerUnit: number;
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
  const electricityAmount = computeElectricityAmount(prevReadingNumber, currReadingNumber, ratePerUnit);
  const electricityUnits = computeElectricityUnits(prevReadingNumber, currReadingNumber);
  const dirty =
    prevReadingNumber !== row.prevReading || currReadingNumber !== row.currReading || electricityPaid !== row.electricityPaid;
  const recorded = row.currReading > row.prevReading;

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
    <li className={`rounded-2xl border p-4 shadow-sm ${recorded ? "border-paid/20 bg-paid-bg/20" : "border-primary/10 bg-white"}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/40">
            Plot {row.plotNumber}
            {recorded && <span className="rounded-full bg-paid-bg px-1.5 py-0.5 text-[10px] font-bold text-paid">Recorded</span>}
          </p>
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

function RateEditor({
  ratePerUnit,
  onSaved,
  onError,
}: {
  ratePerUnit: number;
  onSaved: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const [value, setValue] = useState(String(ratePerUnit));
  const [saving, setSaving] = useState(false);
  const rate = Number(value);
  const invalid = value.trim() === "" || !Number.isFinite(rate) || rate < 0;

  async function save() {
    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/admin/settings/electricity-rate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratePerUnit: rate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save rate.");
      onSaved(`Electricity rate set to ₹${json.ratePerUnit} per unit.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save rate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-primary/10 bg-white p-3.5 shadow-sm sm:p-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-primary-dark">Rate per unit (₹)</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-11 w-32 rounded-xl border border-primary/20 bg-white px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saving || invalid || rate === ratePerUnit}
        className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save rate"}
      </button>
      <p className="basis-full text-xs text-foreground/50">
        Applies to all months, including past ones.
      </p>
    </div>
  );
}

function BulkEntry({
  month,
  rows,
  ratePerUnit,
  onDone,
  onError,
}: {
  month: string;
  rows: ElectricityRow[];
  ratePerUnit: number;
  onDone: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    const { readings, issues } = parseReadings(text);
    const byPlot = new Map(rows.map((r) => [r.plotNumber.toLowerCase(), r]));
    const matched: { row: ElectricityRow; prev: number; curr: number }[] = [];
    const problems = issues.map((i) => `Line ${i.line} (${i.text}): ${i.reason}`);
    for (const reading of readings) {
      const row = byPlot.get(reading.plotNumber.toLowerCase());
      if (!row) {
        problems.push(`Line ${reading.line}: plot "${reading.plotNumber}" not found.`);
        continue;
      }
      const prev = reading.prevReading ?? row.prevReading;
      if (reading.currReading < prev) {
        problems.push(`Line ${reading.line}: current reading is lower than previous (${prev}).`);
        continue;
      }
      matched.push({ row, prev, curr: reading.currReading });
    }
    return { matched, problems };
  }, [text, rows]);

  async function saveAll() {
    setSaving(true);
    onError(null);
    let saved = 0;
    try {
      for (const { row, prev, curr } of preview.matched) {
        const res = await fetch("/api/admin/electricity", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitId: row.unitId,
            month,
            prevReading: prev,
            currReading: curr,
            electricityPaid: row.electricityPaid,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Plot ${row.plotNumber}: ${json.error ?? "failed to save"}. ${saved} saved before this.`);
        saved++;
      }
      setText("");
      setOpen(false);
      onDone(`${saved} reading${saved === 1 ? "" : "s"} saved.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save readings.");
      if (saved > 0) onDone(`${saved} reading${saved === 1 ? "" : "s"} saved before the error.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-primary/10 bg-white p-3.5 shadow-sm sm:p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-primary-dark"
      >
        Paste readings as text
        <span className="text-foreground/40">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-foreground/55">
            One plot per line: <code>101: 1234</code> (current reading) or <code>101 1200 1234</code> (previous, current).
            Or enter readings one by one below.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"101: 1234\n102: 880\nPlot 103 - 1500"}
            className="w-full rounded-xl border border-primary/20 bg-white px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {preview.problems.length > 0 && (
            <ul className="rounded-xl bg-unpaid-bg px-3 py-2 text-xs text-unpaid">
              {preview.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {preview.matched.length > 0 && (
            <ul className="divide-y divide-primary/10 rounded-xl bg-background text-sm">
              {preview.matched.map(({ row, prev, curr }) => (
                <li key={row.unitId} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="font-medium">Plot {row.plotNumber}</span>
                  <span className="text-foreground/60">
                    {prev} → {curr} · {Math.max(0, curr - prev)} units · ₹
                    {computeElectricityAmount(prev, curr, ratePerUnit).toFixed(0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={saveAll}
            disabled={saving || preview.matched.length === 0}
            className="min-h-11 self-start rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : `Save ${preview.matched.length} reading${preview.matched.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
