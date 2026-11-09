"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { formatDate, formatMonthLabel } from "@/lib/month";
import type { PublicInfoResponse, TenantAccountResponse } from "@/lib/types";
import { IconBuilding, IconCalendar, IconLock, IconLogout } from "@/components/icons";

// Public page. Anonymous visitors see only the building name and notice. A tenant signs in with their
// plot number and private access code and sees ONLY their own rent and electricity, so tenants can never
// see each other's amounts. The credentials live in sessionStorage for the tab only.
const STORAGE_KEY = "sjr-tenant";
const rupee = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const inputClass =
  "min-h-12 w-full rounded-xl border border-primary/15 bg-white px-3 py-2 text-base shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function Home() {
  const [info, setInfo] = useState<PublicInfoResponse | null>(null);
  const [account, setAccount] = useState<TenantAccountResponse | null>(null);
  const [plotNumber, setPlotNumber] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async (plot: string, accessCode: string, silent = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ plotNumber: plot, code: accessCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        sessionStorage.removeItem(STORAGE_KEY);
        if (!silent) setError(json.error ?? "Could not sign in.");
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ plotNumber: plot, code: accessCode }));
      setAccount(json as TenantAccountResponse);
    } catch {
      if (!silent) setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
      setRestoring(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/public/info", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setInfo(json))
      .catch(() => setInfo(null));
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { plotNumber: p, code: c } = JSON.parse(saved);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the signed-in tenant on reload
        signIn(p, c, true);
        return;
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    setRestoring(false);
  }, [signIn]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    signIn(plotNumber.trim(), code.trim());
  }

  function signOut() {
    sessionStorage.removeItem(STORAGE_KEY);
    setAccount(null);
    setCode("");
  }

  const buildingName = account?.buildingName ?? info?.buildingName ?? "SJR Building";
  const notice = account?.notice ?? info?.notice ?? "";

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-primary/10 bg-white/85 px-4 py-3.5 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <IconBuilding className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight text-primary-dark sm:text-lg">{buildingName}</h1>
              <p className="text-xs text-foreground/45">Tenant portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {account && (
              <button onClick={signOut} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary/20 px-3.5 py-1.5 text-sm font-medium text-primary-dark hover:bg-primary-light">
                <IconLogout className="h-4 w-4" />
                Sign out
              </button>
            )}
            <Link href="/admin/login" className="shrink-0 rounded-full border border-primary/20 px-3.5 py-1.5 text-sm font-medium text-primary-dark hover:bg-primary-light">
              Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        {notice && (
          <div className="mb-5 whitespace-pre-line rounded-2xl border border-partial/30 bg-partial-bg px-4 py-3 text-sm font-medium text-partial">{notice}</div>
        )}

        {restoring ? (
          <div className="h-48 animate-pulse rounded-2xl bg-primary-light" aria-busy="true" />
        ) : account ? (
          <Account account={account} />
        ) : info && !info.portalEnabled ? (
          <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">The tenant portal is switched off right now. Please contact the owner.</div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary-dark">
              <IconLock className="h-5 w-5" />
            </span>
            <h2 className="text-xl font-bold text-primary-dark">View your account</h2>
            <p className="mt-1 text-sm text-foreground/60">Enter your plot number and the 6-digit access code the owner gave you. You will only see your own rent and electricity.</p>
            <label className="mt-4 flex flex-col gap-1">
              <span className="text-sm font-medium text-primary-dark">Plot number</span>
              <input value={plotNumber} onChange={(e) => setPlotNumber(e.target.value)} suppressHydrationWarning autoComplete="off" inputMode="text" placeholder="e.g. 101" className={inputClass} required />
            </label>
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-sm font-medium text-primary-dark">Access code</span>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} suppressHydrationWarning autoComplete="off" inputMode="numeric" pattern="[0-9]{6}" placeholder="6 digits" className={`${inputClass} tracking-[0.3em]`} required />
            </label>
            {error && <p className="mt-3 rounded-xl border border-unpaid/30 bg-unpaid-bg px-3 py-2 text-sm font-medium text-unpaid">{error}</p>}
            <button type="submit" disabled={loading || code.length !== 6 || !plotNumber.trim()} className="mt-4 min-h-12 w-full rounded-xl bg-primary px-4 text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
              {loading ? "Checking..." : "View my account"}
            </button>
          </form>
        )}
      </main>

      <footer className="px-4 py-6 text-center text-xs text-foreground/40">Your account is private. Other tenants cannot see your rent or electricity.</footer>
    </div>
  );
}

function Account({ account }: { account: TenantAccountResponse }) {
  const { rentTotals, electricityTotals } = account;
  const owed = rentTotals.balance + electricityTotals.due;
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
        <p className="text-2xl font-extrabold leading-tight text-primary-dark">
          <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/40">Plot</span>
          {account.plotNumber}
        </p>
        {account.tenantName && <p className="text-sm font-medium text-foreground/70">{account.tenantName}</p>}
        <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground/60">
          <IconCalendar className="h-4 w-4 text-foreground/35" />
          Joined {formatDate(account.moveInDate)}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Stat label="Monthly rent" value={rupee(account.monthlyRent)} />
          <Stat label="Maintenance" value={rupee(account.maintenanceAmount)} />
          <Stat label="Rent balance" value={rentTotals.balance > 0 ? rupee(rentTotals.balance) : "Nil"} tone={rentTotals.balance > 0 ? "bad" : "good"} />
          <Stat label="Electricity due" value={electricityTotals.due > 0 ? rupee(electricityTotals.due) : "Nil"} tone={electricityTotals.due > 0 ? "bad" : "good"} />
        </dl>
        <p className={`mt-3 rounded-xl px-3 py-2 text-center text-sm font-bold ${owed > 0 ? "bg-unpaid-bg text-unpaid" : "bg-paid-bg text-paid"}`}>
          {owed > 0 ? `Total due ${rupee(owed)}` : "You are all paid up"}
        </p>
      </section>

      <Table title="Rent · all months" footer={{ label: "Total", cells: [rupee(rentTotals.due), rupee(rentTotals.paid), rentTotals.balance > 0 ? rupee(rentTotals.balance) : "Paid"] }} cols={["Month", "Due", "Paid", "Status"]} empty={account.rentMonths.length === 0 ? "No rent records yet." : null}>
        {account.rentMonths.map((m) => (
          <Row key={m.month} cells={[<MonthCell key="m" month={m.month} sub={m.paidDate ? `Paid ${formatDate(m.paidDate)}` : ""} />, rupee(m.rentDue), <span key="p" className={m.paid > 0 ? "font-semibold text-paid" : "text-foreground/45"}>{rupee(m.paid)}</span>, <StatusBadge key="s" status={m.status} />]} />
        ))}
      </Table>

      <Table title={`Electricity · ₹${account.ratePerUnit}/unit`} footer={{ label: "Total", cells: [rupee(electricityTotals.billed), rupee(electricityTotals.paid), electricityTotals.due > 0 ? rupee(electricityTotals.due) : "Paid"] }} cols={["Month", "Bill", "Paid", "Status"]} empty={account.electricityMonths.length === 0 ? "No electricity records yet." : null}>
        {account.electricityMonths.map((m) => (
          <Row key={m.month} cells={[<MonthCell key="m" month={m.month} sub={m.isDefault ? "default bill" : `${m.prevReading} → ${m.currReading} (${m.units} units)`} />, rupee(m.bill), <span key="p" className={m.paid > 0 ? "font-semibold text-paid" : "text-foreground/45"}>{rupee(m.paid)}</span>, <StatusBadge key="s" status={m.status} />]} />
        ))}
      </Table>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl bg-primary-light/60 px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-foreground/45">{label}</dt>
      <dd className={`text-base font-bold ${tone === "bad" ? "text-unpaid" : tone === "good" ? "text-paid" : "text-primary-dark"}`}>{value}</dd>
    </div>
  );
}

const GRID = "grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-x-2 px-3";

function Table({ title, cols, footer, empty, children }: { title: string; cols: string[]; footer: { label: string; cells: string[] }; empty: string | null; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-primary/10 bg-white shadow-sm">
      <h2 className="bg-primary-light px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-dark">{title}</h2>
      {empty ? (
        <p className="px-3 py-3 text-sm text-foreground/55">{empty}</p>
      ) : (
        <>
          <div className={`${GRID} py-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/45`}>
            {cols.map((c, i) => (
              <span key={c} className={i > 0 ? "text-right" : ""}>{c}</span>
            ))}
          </div>
          <ul className="divide-y divide-primary/10">{children}</ul>
          <div className={`${GRID} border-t-2 border-primary/15 bg-primary-light/60 py-2 text-sm font-bold text-primary-dark`}>
            <span>{footer.label}</span>
            {footer.cells.map((c, i) => (
              <span key={i} className="text-right">{c}</span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Row({ cells }: { cells: React.ReactNode[] }) {
  return (
    <li className={`${GRID} py-2 text-sm`}>
      {cells.map((c, i) => (
        <span key={i} className={i > 0 ? "flex justify-end text-right" : "min-w-0"}>{c}</span>
      ))}
    </li>
  );
}

function MonthCell({ month, sub }: { month: string; sub: string }) {
  return (
    <div className="min-w-0 text-left">
      <p className="font-semibold text-foreground">{formatMonthLabel(month)}</p>
      {sub && <p className="truncate text-[11px] text-foreground/50">{sub}</p>}
    </div>
  );
}
