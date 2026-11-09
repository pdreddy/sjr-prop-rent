"use client";

import type { ReactNode } from "react";
import { IconSearch } from "@/components/icons";

// Shared building blocks so every admin screen has the same structure:
// title + subtitle, search and actions on one line, help tucked away, neutral summary tiles.

export function Toolbar({
  title,
  subtitle,
  search,
  actions,
  extra,
  help,
}: {
  title: string;
  subtitle?: string;
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  actions?: ReactNode;
  extra?: ReactNode;
  help?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight text-ink">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          {search && (
            <label className="relative min-w-[200px] flex-1 lg:w-72 lg:flex-none">
              <span className="sr-only">Search</span>
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? "Search plot or tenant"}
                className="min-h-10 w-full rounded-control border border-line-strong bg-white py-2 pl-9 pr-3 text-sm shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
          )}
          {actions}
        </div>
      </div>
      {extra}
      {help && (
        <details className="group rounded-control border border-line bg-white px-3.5 py-2.5 text-sm shadow-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden">
            How this works
            <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-2 max-w-4xl text-xs leading-relaxed text-muted">{help}</div>
        </details>
      )}
    </header>
  );
}

export function ToolbarButton({ onClick, disabled, children, primary }: { onClick: () => void; disabled?: boolean; children: ReactNode; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-10 shrink-0 rounded-control px-4 text-sm font-semibold disabled:opacity-60 ${primary ? "bg-primary text-white hover:bg-primary-dark" : "border border-line-strong bg-white text-ink hover:bg-primary-light"}`}
    >
      {children}
    </button>
  );
}

export type Tone = "good" | "bad" | "warn" | undefined;
const toneText = (tone: Tone) => (tone === "good" ? "text-paid" : tone === "bad" ? "text-unpaid" : tone === "warn" ? "text-partial" : "text-ink");

/** Neutral white tile: small caps label, bold figure; colour only on the figure and only for status. */
export function Tile({ label, value, tone, className = "" }: { label: string; value: string; tone?: Tone; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-white p-3.5 shadow-card ${className}`}>
      <p className="label-caps">{label}</p>
      <p className={`mt-1 text-xl font-extrabold leading-tight tabular-nums ${toneText(tone)}`}>{value}</p>
    </div>
  );
}

/** A titled group of figures in one card, e.g. Rent: due / paid / balance. */
export function TileGroup({ title, items, className = "" }: { title: string; items: { label: string; value: string; tone?: Tone }[]; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-white p-3.5 shadow-card ${className}`}>
      <p className="label-caps">{title}</p>
      <dl className="mt-2 grid grid-cols-3 gap-3">
        {items.map((i) => (
          <div key={i.label} className="min-w-0">
            <dt className="truncate text-xs text-muted">{i.label}</dt>
            <dd className={`truncate text-lg font-extrabold leading-tight tabular-nums ${toneText(i.tone)}`}>{i.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-card border border-line bg-white p-8 text-center text-sm text-muted">{children}</div>;
}
