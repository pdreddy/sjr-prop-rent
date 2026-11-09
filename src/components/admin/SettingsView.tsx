"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElectricityConfig, GeneralSettings, UnitDTO } from "@/lib/types";

const inputClass =
  "min-h-11 w-full rounded-xl border border-primary/20 bg-white px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-primary-dark";
const hintClass = "text-xs font-normal text-foreground/50";
const buttonClass = "min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50";
const smallButton = "min-h-9 rounded-full border border-primary/25 bg-white px-3 text-xs font-semibold text-primary-dark hover:bg-primary-light disabled:opacity-50";

interface Props {
  onUnauthorized: () => void;
  onNotify: (message: string) => void;
}

// One place to configure everything: electricity billing, building / tenant-portal options,
// and the private access codes tenants use to see their own account.
export default function SettingsView({ onUnauthorized, onNotify }: Props) {
  const [electricity, setElectricity] = useState<ElectricityConfig | null>(null);
  const [general, setGeneral] = useState<GeneralSettings | null>(null);
  const [form, setForm] = useState<{ rate: string; high: string; standard: string; plots: string; limit: string } | null>(null);
  const [units, setUnits] = useState<UnitDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([fetch("/api/admin/settings", { cache: "no-store" }), fetch("/api/admin/units", { cache: "no-store" })]);
      if (s.status === 401 || u.status === 401) return onUnauthorized();
      if (!s.ok || !u.ok) throw new Error();
      const settings: { electricity: ElectricityConfig; general: GeneralSettings } = await s.json();
      setElectricity(settings.electricity);
      setGeneral(settings.general);
      setForm({
        rate: String(settings.electricity.ratePerUnit),
        high: String(settings.electricity.defaultHigh),
        standard: String(settings.electricity.defaultStandard),
        plots: settings.electricity.highPlots.join(", "),
        limit: String(settings.electricity.excessLimit),
      });
      setUnits(((await u.json()).units as UnitDTO[]).filter((x) => x.active));
    } catch {
      setError("Could not load settings. Please try again.");
    }
  }, [onUnauthorized]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, [load]);

  const invalid = useMemo(() => {
    if (!form) return true;
    return [form.rate, form.high, form.standard, form.limit].some((v) => v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0) || Number(form.rate) > 1000;
  }, [form]);

  async function save() {
    if (!form || !general) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          electricity: { ratePerUnit: Number(form.rate), defaultHigh: Number(form.high), defaultStandard: Number(form.standard), highPlots: form.plots, excessLimit: Number(form.limit) },
          general,
        }),
      });
      if (res.status === 401) return onUnauthorized();
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save settings.");
      onNotify("Settings saved. They apply to every month, past and future.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function codeAction(body: Record<string, unknown>, key: string, done?: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/access-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) return onUnauthorized();
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not update the code.");
      if (done) onNotify(done.replace("{n}", String(json.changed)));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the code.");
    } finally {
      setBusy(null);
    }
  }

  function setCustomCode(unit: UnitDTO) {
    const code = prompt(`Set a 6-digit access code for Plot ${unit.plotNumber}`, unit.accessCode ?? "");
    if (code === null) return;
    codeAction({ action: "set", unitId: unit.id, code: code.trim() }, unit.id, `Code set for Plot ${unit.plotNumber}.`);
  }

  if (!form || !general || !electricity) {
    return error ? <p className="mb-4 rounded-xl border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">{error}</p> : <div className="h-40 animate-pulse rounded-2xl bg-primary-light" aria-busy="true" />;
  }

  const missing = units.filter((u) => !u.accessCode).length;
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }) });

  return (
    <div className="mb-4 flex flex-col gap-4">
      {error && <p className="rounded-xl border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">{error}</p>}

      <section className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-primary-dark">Electricity</h2>
        <p className="mb-3 text-xs text-foreground/55">Used for every bill in the admin screens and on the tenant portal. Changes apply to past months too.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Rate per unit (₹)
            <input type="number" inputMode="decimal" min={0} max={1000} step="0.01" className={inputClass} {...field("rate")} />
          </label>
          <label className={labelClass}>
            Over-payment limit (₹)
            <input type="number" inputMode="decimal" min={0} step="1" className={inputClass} {...field("limit")} />
            <span className={hintClass}>Money paid above rent counts as electricity only when under this amount; larger is rent paid ahead.</span>
          </label>
          <label className={labelClass}>
            Default bill, no reading — high plots (₹)
            <input type="number" inputMode="decimal" min={0} step="1" className={inputClass} {...field("high")} />
          </label>
          <label className={labelClass}>
            Default bill, no reading — other plots (₹)
            <input type="number" inputMode="decimal" min={0} step="1" className={inputClass} {...field("standard")} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            High plots
            <input className={inputClass} placeholder="101, 201, 301" {...field("plots")} />
            <span className={hintClass}>Plot numbers billed the &ldquo;high&rdquo; default when the meter has not been read. Separate with commas or spaces.</span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-primary-dark">Building &amp; tenant portal</h2>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <label className={labelClass}>
            Building name
            <input className={inputClass} maxLength={100} value={general.buildingName} onChange={(e) => setGeneral({ ...general, buildingName: e.target.value })} />
          </label>
          <label className={labelClass}>
            Notice for tenants
            <textarea className={`${inputClass} min-h-24`} maxLength={500} placeholder="e.g. Rent is due by the 5th of every month." value={general.notice} onChange={(e) => setGeneral({ ...general, notice: e.target.value })} />
            <span className={hintClass}>Shown at the top of the public page. Leave empty for no notice.</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm font-medium text-primary-dark">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={general.portalEnabled} onChange={(e) => setGeneral({ ...general, portalEnabled: e.target.checked })} />
            <span>
              Tenant portal enabled
              <span className={`block ${hintClass}`}>When off, nobody can sign in on the public page. Tenants only ever see their own plot; there is no public list of plots or rents.</span>
            </span>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving || invalid} className={buttonClass}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {invalid && <span className="text-xs text-unpaid">Enter valid, non-negative numbers (rate up to 1000).</span>}
      </div>

      <section className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-primary-dark">Tenant access codes</h2>
            <p className="text-xs text-foreground/55">Give each tenant their plot number and code privately. They sign in on the home page and see only their own rent and electricity.</p>
          </div>
          <button type="button" disabled={busy !== null || missing === 0} onClick={() => codeAction({ action: "generate-missing" }, "all", "Generated {n} code(s).")} className={smallButton}>
            {busy === "all" ? "Generating…" : `Generate missing (${missing})`}
          </button>
        </div>
        {units.length === 0 ? (
          <p className="mt-3 text-sm text-foreground/55">No plots yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-primary/10 rounded-xl border border-primary/10">
            {units.map((unit) => (
              <li key={unit.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-primary-dark">Plot {unit.plotNumber}</p>
                  <p className="truncate text-xs text-foreground/55">{unit.tenantName || "Vacant"}</p>
                </div>
                <code className={`rounded-lg px-2.5 py-1 text-base font-bold tracking-[0.25em] ${unit.accessCode ? "bg-primary-light text-primary-dark" : "bg-vacant-bg text-vacant tracking-normal"}`}>{unit.accessCode ?? "no code"}</code>
                <div className="flex gap-1.5">
                  <button type="button" disabled={busy !== null} onClick={() => codeAction({ action: "regenerate", unitId: unit.id }, unit.id, `New code for Plot ${unit.plotNumber}.`)} className={smallButton}>
                    {unit.accessCode ? "New code" : "Generate"}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => setCustomCode(unit)} className={smallButton}>Set</button>
                  {unit.accessCode && (
                    <button type="button" disabled={busy !== null} onClick={() => confirm(`Remove the code for Plot ${unit.plotNumber}? They will no longer be able to sign in.`) && codeAction({ action: "clear", unitId: unit.id }, unit.id, `Code removed for Plot ${unit.plotNumber}.`)} className={smallButton}>Remove</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
