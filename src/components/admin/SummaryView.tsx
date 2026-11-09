"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { formatMonthLabel, getCurrentMonth, getMonthOptions, getNextMonth, getPreviousMonth } from "@/lib/month";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { rupee, shortMonth } from "@/lib/format";
import type { SummaryResponse } from "@/lib/types";
import { EmptyState, Tile } from "./ui";

// Month rollup: money tiles, two status donuts (rent, electricity), a 6-month trend and who owes the most.
// Colours are the app's status tokens. Every slice is also named and counted in its legend, "Partial" carries
// a hatch, and slices are separated by a gap, so nothing relies on colour alone.
const COLORS = {
  paid: "var(--color-paid)",
  partial: "var(--color-partial)",
  unpaid: "var(--color-unpaid)",
  none: "#a1a1aa",
} as const;
type Kind = keyof typeof COLORS;

interface Slice {
  kind: Kind;
  label: string;
  value: number;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

interface Props {
  onUnauthorized: () => void;
}

export default function SummaryView({ onUnauthorized }: Props) {
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (m: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/summary?month=${m}`, { cache: "no-store" });
        if (res.status === 401) return onUnauthorized();
        if (!res.ok) throw new Error();
        setData(await res.json());
      } catch {
        setError("Could not load the summary. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on month change
    load(month);
  }, [load, month]);

  const options = getMonthOptions();
  const current = getCurrentMonth();
  const canPrev = month > BUILDING_READY_MONTH;
  const canNext = month < current;

  return (
    <div className="mb-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-white p-3 shadow-card sm:p-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Month
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="min-h-11 rounded-control border border-line-strong bg-white px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {(options.includes(month) ? options : [month, ...options]).map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label="Previous month"
          disabled={!canPrev}
          onClick={() => setMonth(getPreviousMonth(month))}
          className="min-h-11 min-w-11 rounded-control border border-line-strong text-lg font-bold text-ink hover:bg-primary-light disabled:opacity-40"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next month"
          disabled={!canNext}
          onClick={() => setMonth(getNextMonth(month))}
          className="min-h-11 min-w-11 rounded-control border border-line-strong text-lg font-bold text-ink hover:bg-primary-light disabled:opacity-40"
        >
          ›
        </button>
        {month !== current && (
          <button
            type="button"
            onClick={() => setMonth(current)}
            className="min-h-11 rounded-control border border-line-strong px-3 text-sm font-semibold text-ink hover:bg-primary-light"
          >
            This month
          </button>
        )}
        <p className="ml-auto text-xs text-muted">Everything below is for {formatMonthLabel(month)}.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-control border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">
          {error}
        </p>
      )}
      {!data && loading && <div className="h-48 animate-pulse rounded-card bg-primary-light" aria-busy="true" />}

      {data && (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {data.plots.applicable === 0 ? (
            <EmptyState>No tenants with rent due in {formatMonthLabel(data.month)} yet.</EmptyState>
          ) : (
            <Body data={data} />
          )}
        </div>
      )}
    </div>
  );
}

function Body({ data }: { data: SummaryResponse }) {
  const { rent, electricity, plots } = data;
  const rentSlices: Slice[] = [
    { kind: "paid", label: "Paid", value: rent.counts.paid },
    { kind: "partial", label: "Partial", value: rent.counts.partial },
    { kind: "unpaid", label: "Unpaid", value: rent.counts.unpaid },
  ];
  const elecSlices: Slice[] = [
    { kind: "paid", label: "Paid", value: electricity.counts.paid },
    { kind: "partial", label: "Partial", value: electricity.counts.partial },
    { kind: "unpaid", label: "Unpaid", value: electricity.counts.unpaid },
    { kind: "none", label: "No bill yet", value: electricity.counts.none },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Rent collected" value={rupee(rent.collected)} tone="good" />
        <Tile label="Rent outstanding" value={rupee(rent.outstanding)} tone={rent.outstanding > 0 ? "bad" : "good"} />
        <Tile label="Electricity billed" value={rupee(electricity.billed)} />
        <Tile label="Electricity due" value={rupee(electricity.due)} tone={electricity.due > 0 ? "bad" : "good"} />
      </div>

      <section className="rounded-card border border-line bg-white p-4 shadow-card" aria-label="Rent collection progress">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-ink">Rent collection</h2>
          <p className="text-sm text-muted">
            <span className="font-bold text-ink">{rupee(rent.collected)}</span> of {rupee(rent.expected)} · {rent.collectedPct}%
          </p>
        </div>
        <div
          className="mt-3 h-3 w-full overflow-hidden rounded-full bg-primary-light"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={rent.collectedPct}
          aria-label="Rent collected"
        >
          <div className="h-full rounded-full bg-paid" style={{ width: `${rent.collectedPct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">
          {plots.applicable} of {plots.occupied} tenants have rent due this month
          {plots.notStarted > 0 ? ` (${plots.notStarted} start later)` : ""}
          {plots.vacant > 0 ? ` · ${plots.vacant} vacant plot${plots.vacant === 1 ? "" : "s"}` : ""}.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DonutCard
          title="Rent status"
          subtitle="Tenants by payment status"
          slices={rentSlices}
          centerBig={`${rent.counts.paid}/${plots.applicable}`}
          centerSmall="paid"
        />
        <DonutCard
          title="Electricity status"
          subtitle={`${electricity.readingsEntered} of ${electricity.readingsExpected} meter${electricity.readingsExpected === 1 ? "" : "s"} read · ${electricity.formula}`}
          slices={elecSlices}
          centerBig={`${electricity.counts.paid}/${electricity.counts.paid + electricity.counts.partial + electricity.counts.unpaid}`}
          centerSmall="bills paid"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TrendCard
          title="Rent, last 6 months"
          unitLabel="rent"
          data={data.trend.map((t) => ({
            month: t.month,
            total: t.rentExpected,
            good: Math.min(t.rentCollected, t.rentExpected),
            bad: Math.max(0, t.rentExpected - t.rentCollected),
          }))}
          goodLabel="Collected"
          badLabel="Outstanding"
          selected={data.month}
        />
        <TrendCard
          title="Electricity, last 6 months"
          unitLabel="electricity"
          data={data.trend.map((t) => ({ month: t.month, total: t.electricityBilled, good: t.electricityCovered, bad: t.electricityDue }))}
          goodLabel="Paid"
          badLabel="Due"
          selected={data.month}
        />
      </div>

      <section className="rounded-card border border-line bg-white p-4 shadow-card" aria-label="Plots owing the most">
        <h2 className="text-base font-bold text-ink">Owing the most</h2>
        {data.topDue.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-paid">Nothing outstanding for {formatMonthLabel(data.month)}.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">Plot</th>
                  <th scope="col" className="py-1.5 pr-3 font-semibold">Tenant</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Rent</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Electricity</th>
                  <th scope="col" className="py-1.5 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.topDue.map((row) => (
                  <tr key={row.plotNumber} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 font-bold text-ink">{row.plotNumber}</th>
                    <td className="max-w-40 truncate py-2 pr-3">{row.tenantName ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.rentDue ? rupee(row.rentDue) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.electricityDue ? rupee(row.electricityDue) : "—"}</td>
                    <td className="py-2 text-right font-bold tabular-nums text-unpaid">{rupee(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// ---- Donut ---------------------------------------------------------------------------------------

const R = 40;
const CIRC = 2 * Math.PI * R;
const GAP = 2; // px of surface between slices

function DonutCard({ title, subtitle, slices, centerBig, centerSmall }: { title: string; subtitle: string; slices: Slice[]; centerBig: string; centerSmall: string }) {
  const uid = useId();
  const [active, setActive] = useState<Kind | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const shown = slices.filter((s) => s.value > 0);
  const hit = active ? slices.find((s) => s.kind === active) : null;

  const arcs = shown.map((s, i) => {
    const before = shown.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    return { ...s, len: (s.value / total) * CIRC, offset: (before / total) * CIRC };
  });

  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-card" aria-label={title}>
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <p className="text-xs text-muted">{subtitle}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${title}: ${slices.map((s) => `${s.value} ${s.label}`).join(", ")}`}>
            <defs>
              <pattern id={`${uid}-hatch`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                <rect width="5" height="5" fill={COLORS.partial} />
                <line x1="0" y1="0" x2="0" y2="5" stroke="#fff" strokeWidth="1.6" />
              </pattern>
            </defs>
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-primary-light)" strokeWidth="14" />
            {arcs.map((a) => (
              <circle
                key={a.kind}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={a.kind === "partial" ? `url(#${uid}-hatch)` : COLORS[a.kind]}
                strokeWidth={active === a.kind ? 16 : 14}
                strokeDasharray={`${Math.max(0, a.len - (arcs.length > 1 ? GAP : 0))} ${CIRC}`}
                strokeDashoffset={-a.offset}
                onPointerEnter={() => setActive(a.kind)}
                onPointerLeave={() => setActive(null)}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xl font-extrabold leading-none tabular-nums text-ink">{hit ? hit.value : centerBig}</span>
            <span className="mt-1 text-xs font-medium text-muted">{hit ? hit.label.toLowerCase() : centerSmall}</span>
          </div>
        </div>
        <ul className="min-w-40 flex-1 space-y-1">
          {slices.map((s) => (
            <li
              key={s.kind}
              tabIndex={0}
              onPointerEnter={() => setActive(s.kind)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(s.kind)}
              onBlur={() => setActive(null)}
              className={`flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm ${active === s.kind ? "bg-primary-light" : ""}`}
            >
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.kind === "partial" ? `repeating-linear-gradient(45deg, ${COLORS.partial} 0 2px, #fff 2px 4px)` : COLORS[s.kind] }} />
              <span className="flex-1 text-ink">{s.label}</span>
              <span className="font-bold tabular-nums text-ink">{s.value}</span>
              <span className="w-10 text-right text-xs tabular-nums text-muted">{pct(s.value, total)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---- Trend (stacked columns, one axis) -------------------------------------------------------------

interface TrendDatum {
  month: string;
  total: number;
  good: number;
  bad: number;
}

function TrendCard({ title, unitLabel, data, goodLabel, badLabel, selected }: { title: string; unitLabel: string; data: TrendDatum[]; goodLabel: string; badLabel: string; selected: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.good + d.bad));
  const HEIGHT = 128;
  const hovered = hover !== null ? data[hover] : null;
  const empty = data.every((d) => d.good + d.bad === 0);

  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-card" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        <ul className="flex gap-3 text-xs text-muted">
          <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.paid }} />{goodLabel}</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.unpaid }} />{badLabel}</li>
        </ul>
      </div>
      {empty ? (
        <p className="mt-6 text-sm text-muted">No {unitLabel} recorded in these months.</p>
      ) : (
        <>
          <div className="relative mt-4">
            <div className="flex items-end gap-2" style={{ height: HEIGHT + 20 }}>
              {data.map((d, i) => {
                const sum = d.good + d.bad;
                const h = (sum / max) * HEIGHT;
                const goodH = sum > 0 ? (d.good / sum) * h : 0;
                return (
                  <div
                    key={d.month}
                    tabIndex={0}
                    role="img"
                    aria-label={`${shortMonth(d.month)}: ${goodLabel} ${rupee(d.good)}, ${badLabel} ${rupee(d.bad)}`}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end outline-none"
                  >
                    <span className="mb-1 text-[11px] font-semibold tabular-nums text-ink">{sum > 0 ? compact(sum) : ""}</span>
                    <div className="flex w-full flex-col justify-end overflow-hidden rounded-t-md" style={{ height: Math.max(h, sum > 0 ? 2 : 0) }}>
                      {d.bad > 0 && <div style={{ height: h - goodH, background: COLORS.unpaid, marginBottom: d.good > 0 ? 2 : 0 }} />}
                      {d.good > 0 && <div style={{ height: goodH, background: COLORS.paid }} />}
                    </div>
                    {hover === i && <span aria-hidden className="absolute inset-y-0 -z-10 rounded-md bg-primary-light" style={{ left: `calc(${(i / data.length) * 100}% - 2px)`, width: `calc(${100 / data.length}% + 4px)` }} />}
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex gap-2">
              {data.map((d) => (
                <span key={d.month} className={`min-w-0 flex-1 truncate text-center text-xs ${d.month === selected ? "font-bold text-ink" : "text-muted"}`}>
                  {new Date(`${d.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-2 min-h-5 text-xs text-muted" aria-live="polite">
            {hovered ? (
              <>
                <span className="font-semibold text-ink">{shortMonth(hovered.month)}</span> · {goodLabel} <b className="text-ink">{rupee(hovered.good)}</b> · {badLabel} <b className="text-ink">{rupee(hovered.bad)}</b>
              </>
            ) : (
              "Hover or focus a month for the exact amounts."
            )}
          </p>
        </>
      )}
    </section>
  );
}

/** 12.4k / 1.2L style short figure for column tops (full amounts are in the readout). */
function compact(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(n >= 1000000 ? 0 : 1).replace(/\.0$/, "")}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}
