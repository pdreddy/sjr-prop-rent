"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMonthLabel } from "@/lib/month";
import { rupee } from "@/lib/format";
import type { ActivityChange, ActivityEntry, ActivityLogResponse } from "@/lib/types";
import { EmptyState } from "./ui";

// "What was entered": every save in the admin pages (payments, meter readings, plots, settings), newest first,
// with the old and new value of each field that changed. Filter by kind, search, and export what is shown.
const PAGE = 100;
type Group = "ALL" | ActivityEntry["group"];
const GROUPS: { id: Group; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "Payment", label: "Payments" },
  { id: "Electricity", label: "Meter readings" },
  { id: "Unit", label: "Plots" },
  { id: "Settings", label: "Settings" },
  { id: "Other", label: "Other" },
];

const ACTION: Record<string, { label: string; tone: string }> = {
  CREATE: { label: "Added", tone: "bg-paid-bg text-paid" },
  UPDATE: { label: "Changed", tone: "bg-primary-light text-ink" },
  DELETE: { label: "Deleted", tone: "bg-unpaid-bg text-unpaid" },
  MOVE: { label: "Moved", tone: "bg-partial-bg text-partial" },
  COPY_MONTH: { label: "Copied month", tone: "bg-primary-light text-ink" },
  BACKFILL_MONTHS: { label: "Filled months", tone: "bg-primary-light text-ink" },
  SET_MOVE_IN_PAYMENT: { label: "Move-in rent", tone: "bg-primary-light text-ink" },
  CHANGE_PASSWORD: { label: "Password changed", tone: "bg-vacant-bg text-vacant" },
};
const actionOf = (a: string) => ACTION[a] ?? { label: a.replaceAll("_", " ").toLowerCase(), tone: "bg-vacant-bg text-vacant" };

const MONEY = new Set(["rentAmount", "maintenanceAmount", "amountPaid", "balanceDue", "monthlyRent", "advanceAmount", "advancePaid", "defaultHigh", "defaultStandard", "excessLimit", "fixedCharge"]);
const DATES = new Set(["paidDate", "moveInDate", "advancePaidDate"]);

// Entries of a list, e.g. the formula schedule's { fromMonth: "2026-11", formula: "slab" } -> "November 2026: slab".
function formatItem(item: unknown): string {
  if (item && typeof item === "object") {
    const row = item as { fromMonth?: string; formula?: string };
    if (row.fromMonth) return `${formatMonthLabel(row.fromMonth)}: ${row.formula ?? ""}`.trim();
    return Object.values(item).join(" ");
  }
  return String(item);
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map((item) => formatItem(item)).join(", ") : "—";
  if (typeof value === "number") return MONEY.has(key) ? rupee(value) : String(value);
  if (typeof value === "string" && DATES.has(key)) return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) return formatMonthLabel(value);
  return String(value);
}

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA"); // YYYY-MM-DD in the viewer's zone
const dayLabel = (iso: string) => {
  const key = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function subject(entry: ActivityEntry): string {
  const parts: string[] = [];
  if (entry.plotNumber) parts.push(`Plot ${entry.plotNumber}`);
  if (entry.month) parts.push(formatMonthLabel(entry.month));
  const what = entry.group === "Electricity" ? "Meter reading" : entry.group === "Payment" ? "Payment" : entry.group === "Unit" ? "Plot details" : entry.group === "Settings" ? "Settings" : entry.recordType;
  return parts.length ? `${parts.join(" · ")} — ${what}` : what;
}

const csvCell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
function exportCsv(entries: ActivityEntry[]) {
  const rows = [["When", "By", "Action", "Record", "Plot", "Month", "Field", "From", "To"]];
  for (const e of entries) {
    const base = [new Date(e.createdAt).toISOString(), e.adminUsername, actionOf(e.action).label, e.group, e.plotNumber ?? "", e.month ?? ""];
    if (e.changes.length === 0) rows.push([...base, "", "", ""]);
    for (const c of e.changes) rows.push([...base, c.label, formatValue(c.key, c.from), formatValue(c.key, c.to)]);
  }
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `activity-log-${dayKey(new Date().toISOString())}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ActivityLogView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [limit, setLimit] = useState(PAGE);
  const [data, setData] = useState<ActivityLogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group>("ALL");
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (n: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/audit-logs?limit=${n}`, { cache: "no-store" });
        if (res.status === 401) return onUnauthorized();
        if (!res.ok) throw new Error();
        setData(await res.json());
      } catch {
        setError("Could not load the activity log. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch when the page size changes
    load(limit);
  }, [load, limit]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: data?.entries.length ?? 0 };
    for (const e of data?.entries ?? []) c[e.group] = (c[e.group] ?? 0) + 1;
    return c;
  }, [data]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.entries ?? []).filter(
      (e) =>
        (group === "ALL" || e.group === group) &&
        (!q || [e.plotNumber, e.tenantName, e.adminUsername, e.month, e.recordType, actionOf(e.action).label, ...e.changes.map((c) => c.label)].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [data, group, query]);

  const days = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const e of shown) map.set(dayKey(e.createdAt), [...(map.get(dayKey(e.createdAt)) ?? []), e]);
    return [...map.values()];
  }, [shown]);

  return (
    <div className="mb-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-white p-3 shadow-card sm:p-4">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium text-ink">
          Search
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Plot, tenant, user, month or field"
            className="min-h-11 rounded-control border border-line-strong bg-white px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <button
          type="button"
          disabled={shown.length === 0}
          onClick={() => exportCsv(shown)}
          className="min-h-11 rounded-control border border-line-strong px-4 text-sm font-semibold text-ink hover:bg-primary-light disabled:opacity-40"
        >
          Export CSV
        </button>
        <div className="flex basis-full gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by kind">
          {GROUPS.filter((g) => g.id === "ALL" || (counts[g.id] ?? 0) > 0 || g.id === group).map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={group === g.id}
              onClick={() => setGroup(g.id)}
              className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${group === g.id ? "border-primary bg-primary text-white" : "border-line-strong bg-white text-muted hover:text-ink"}`}
            >
              {g.label} <span className="tabular-nums opacity-70">{counts[g.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-control border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">
          {error}
        </p>
      )}
      {!data && loading && <div className="h-40 animate-pulse rounded-card bg-primary-light" aria-busy="true" />}

      {data && (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {data.entries.length === 0 ? (
            <EmptyState>Nothing has been entered yet. Changes you make in the admin pages will appear here.</EmptyState>
          ) : shown.length === 0 ? (
            <EmptyState>No entries match. Try another search or filter.</EmptyState>
          ) : (
            days.map((entries) => (
              <section key={dayKey(entries[0].createdAt)} aria-label={dayLabel(entries[0].createdAt)}>
                <h2 className="mb-2 px-1 text-sm font-bold text-ink">
                  {dayLabel(entries[0].createdAt)} <span className="font-medium text-muted">· {entries.length}</span>
                </h2>
                <ul className="flex flex-col gap-2">
                  {entries.map((e) => (
                    <Entry key={e.id} entry={e} />
                  ))}
                </ul>
              </section>
            ))
          )}
          {data.hasMore && (
            <button
              type="button"
              disabled={loading}
              onClick={() => setLimit(limit + PAGE)}
              className="min-h-11 self-center rounded-control border border-line-strong bg-white px-5 text-sm font-semibold text-ink hover:bg-primary-light disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load older entries"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const PREVIEW = 6;

function Entry({ entry }: { entry: ActivityEntry }) {
  const [open, setOpen] = useState(false);
  const action = actionOf(entry.action);
  // Collapse only when it saves real space: a single hidden row is not worth a button.
  const collapsible = entry.changes.length > PREVIEW + 1;
  const visible = open || !collapsible ? entry.changes : entry.changes.slice(0, PREVIEW);
  const hidden = entry.changes.length - visible.length;
  return (
    <li className="rounded-card border border-line bg-white p-3.5 shadow-card">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${action.tone}`}>{action.label}</span>
        <span className="text-sm font-semibold text-ink">{subject(entry)}</span>
        {entry.tenantName && <span className="text-sm text-muted">{entry.tenantName}</span>}
        <span className="ml-auto text-xs text-muted">
          {timeLabel(entry.createdAt)} · by <span className="font-semibold text-ink">{entry.adminUsername}</span>
        </span>
      </div>
      {entry.changes.length > 0 && (
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {visible.map((c) => (
            <Change key={c.label} change={c} entry={entry} />
          ))}
        </dl>
      )}
      {entry.changes.length === 0 && <p className="mt-1 text-sm text-muted">Saved with no field changed.</p>}
      {collapsible && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-2 min-h-11 text-sm font-semibold text-primary hover:underline">
          {open ? "Show fewer" : `Show ${hidden} more`}
        </button>
      )}
    </li>
  );
}

function Change({ change, entry }: { change: ActivityChange; entry: ActivityEntry }) {
  const added = entry.action === "CREATE";
  const removed = entry.action === "DELETE";
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <dt className="text-muted">{change.label}</dt>
      <dd className="min-w-0 break-words tabular-nums text-ink">
        {added ? (
          <b>{formatValue(change.key, change.to)}</b>
        ) : removed ? (
          <span className="line-through opacity-70">{formatValue(change.key, change.from)}</span>
        ) : (
          <>
            <span className="text-muted line-through">{formatValue(change.key, change.from)}</span> <span aria-label="changed to">→</span> <b>{formatValue(change.key, change.to)}</b>
          </>
        )}
      </dd>
    </div>
  );
}
