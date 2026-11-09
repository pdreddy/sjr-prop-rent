"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPlotFixed } from "@/lib/config";
import type { ElectricityConfig, GeneralSettings } from "@/lib/types";

const inputClass =
  "min-h-11 w-full rounded-control border border-line-strong bg-white px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-ink";
const hintClass = "text-xs font-normal text-foreground/50";
const buttonClass =
  "min-h-11 rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50";

interface Props {
  onUnauthorized: () => void;
  onNotify: (message: string) => void;
}

interface Form {
  rate: string;
  slab: string;
  above: string;
  fppca: string;
  surcharge: string;
  tax: string;
  fixedCharge: string;
  round: boolean;
  high: string;
  standard: string;
  plots: string;
  limit: string;
  fixed: string;
}

// One place to configure electricity billing, the building name and the notice on the public page.
export default function SettingsView({ onUnauthorized, onNotify }: Props) {
  const [general, setGeneral] = useState<GeneralSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      if (res.status === 401) return onUnauthorized();
      if (!res.ok) throw new Error();
      const settings: {
        electricity: ElectricityConfig;
        general: GeneralSettings;
      } = await res.json();
      setGeneral(settings.general);
      setForm({
        rate: String(settings.electricity.ratePerUnit),
        slab: String(settings.electricity.slabLimit),
        above: String(settings.electricity.rateAboveLimit),
        fppca: String(settings.electricity.fppcaPerUnit),
        surcharge: String(settings.electricity.surchargePerUnit),
        tax: String(settings.electricity.taxPercent),
        fixedCharge: String(settings.electricity.fixedCharge),
        round: settings.electricity.roundToRupee,
        high: String(settings.electricity.defaultHigh),
        standard: String(settings.electricity.defaultStandard),
        plots: settings.electricity.highPlots.join(", "),
        limit: String(settings.electricity.excessLimit),
        fixed: formatPlotFixed(settings.electricity.plotFixed),
      });
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
    return (
      [form.rate, form.slab, form.above, form.fppca, form.surcharge, form.tax, form.fixedCharge, form.high, form.standard, form.limit].some(
        (v) => v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0,
      ) || Number(form.rate) > 1000 || Number(form.above) > 1000 || Number(form.tax) > 100
    );
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
          electricity: {
            ratePerUnit: Number(form.rate),
            slabLimit: Number(form.slab),
            rateAboveLimit: Number(form.above),
            fppcaPerUnit: Number(form.fppca),
            surchargePerUnit: Number(form.surcharge),
            taxPercent: Number(form.tax),
            fixedCharge: Number(form.fixedCharge),
            roundToRupee: form.round,
            defaultHigh: Number(form.high),
            defaultStandard: Number(form.standard),
            highPlots: form.plots,
            excessLimit: Number(form.limit),
            plotFixed: form.fixed,
          },
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

  if (!form || !general) {
    return error ? (
      <p className="mb-4 rounded-control border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">
        {error}
      </p>
    ) : (
      <div
        className="h-40 animate-pulse rounded-card bg-primary-light"
        aria-busy="true"
      />
    );
  }

  const field = (key: Exclude<keyof Form, "round">) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <div className="mb-4 flex flex-col gap-4">
      {error && (
        <p className="rounded-control border border-unpaid/30 bg-unpaid-bg px-3.5 py-2.5 text-sm font-medium text-unpaid">
          {error}
        </p>
      )}

      <section className="rounded-card border border-line bg-white p-4 shadow-card">
        <h2 className="text-base font-bold text-ink">Electricity</h2>
        <p className="mb-3 text-xs text-foreground/55">
          With a current meter reading: units = current − previous; energy = first
          slab units × rate + remaining units × rate above slab; bill = energy + units × FPPCA +
          units × surcharge + tax % of energy + fixed charge. Until a reading is entered, the fixed bill below applies. Changes
          apply to past months too.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Rate per unit — first slab (₹)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className={inputClass}
              {...field("rate")}
            />
          </label>
          <label className={labelClass}>
            Slab size (units)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              className={inputClass}
              {...field("slab")}
            />
            <span className={hintClass}>Units billed at the first rate. 0 = one flat rate for all units.</span>
          </label>
          <label className={labelClass}>
            Rate per unit — above the slab (₹)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className={inputClass}
              {...field("above")}
            />
          </label>
          <label className={labelClass}>
            FPPCA per unit (₹)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className={inputClass}
              {...field("fppca")}
            />
          </label>
          <label className={labelClass}>
            Surcharge per unit (₹)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className={inputClass}
              {...field("surcharge")}
            />
          </label>
          <label className={labelClass}>
            Tax (% of energy charge)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className={inputClass}
              {...field("tax")}
            />
          </label>
          <label className={labelClass}>
            Fixed charge per bill (₹)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              className={inputClass}
              {...field("fixedCharge")}
            />
            <span className={hintClass}>Added to each plot&apos;s bill in a month with a meter reading.</span>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={form.round}
              onChange={(e) => setForm({ ...form, round: e.target.checked })}
            />
            Round each bill to the nearest rupee
          </label>
          <label className={labelClass}>
            Over-payment limit (₹)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              className={inputClass}
              {...field("limit")}
            />
            <span className={hintClass}>
              Money paid above rent counts as electricity only when under this
              amount; larger is rent paid ahead.
            </span>
          </label>
          <label className={labelClass}>
            Fixed bill while no units are recorded — high plots (₹)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              className={inputClass}
              {...field("high")}
            />
          </label>
          <label className={labelClass}>
            Fixed bill while no units are recorded — other plots (₹)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              className={inputClass}
              {...field("standard")}
            />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Fixed bill for specific plots (optional)
            <input
              className={inputClass}
              placeholder="101=900, 305=650"
              {...field("fixed")}
            />
            <span className={hintClass}>
              Plot=amount pairs. These override the high/other default for that
              plot while its meter has not been read.
            </span>
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            High plots
            <input
              className={inputClass}
              placeholder="101, 201, 301"
              {...field("plots")}
            />
            <span className={hintClass}>
              Plot numbers billed the &ldquo;high&rdquo; default when the meter
              has not been read. Separate with commas or spaces.
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-card border border-line bg-white p-4 shadow-card">
        <h2 className="text-base font-bold text-ink">
          Building &amp; public page
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <label className={labelClass}>
            Building name
            <input
              className={inputClass}
              maxLength={100}
              value={general.buildingName}
              onChange={(e) =>
                setGeneral({ ...general, buildingName: e.target.value })
              }
            />
          </label>
          <label className={labelClass}>
            Notice for tenants
            <textarea
              className={`${inputClass} min-h-24`}
              maxLength={500}
              placeholder="e.g. Rent is due by the 5th of every month."
              value={general.notice}
              onChange={(e) =>
                setGeneral({ ...general, notice: e.target.value })
              }
            />
            <span className={hintClass}>
              Shown at the top of the public status page. Leave empty for no
              notice.
            </span>
          </label>
          <label className={labelClass}>
            Public tenant names
            <select
              className={inputClass}
              value={
                !general.showTenantNames
                  ? "hidden"
                  : general.maskTenantNames
                    ? "masked"
                    : "full"
              }
              onChange={(event) =>
                setGeneral({
                  ...general,
                  showTenantNames: event.target.value !== "hidden",
                  maskTenantNames: event.target.value === "masked",
                })
              }
            >
              <option value="full">Show full names</option>
              <option value="masked">
                Mask names — first 3 characters only
              </option>
              <option value="hidden">Hide names — plot numbers only</option>
            </select>
            <span className={hintClass}>
              Masked example: Deepika → Dee***. Names are masked or removed on
              the server before reaching the public page. Admins keep full
              names.
            </span>
          </label>
        </div>
      </section>

      <div className="sticky bottom-20 z-10 md:bottom-3 flex flex-wrap items-center gap-3 rounded-card border border-line bg-white/95 p-3 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={saving || invalid}
          className={buttonClass}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        <span
          className={`text-xs ${invalid ? "text-unpaid" : "text-foreground/55"}`}
        >
          {invalid
            ? "Enter valid, non-negative numbers (rate up to 1000)."
            : "Applies to every month, past and future."}
        </span>
      </div>
    </div>
  );
}
