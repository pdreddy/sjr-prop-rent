"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FORMULA_KEYS, FORMULA_LABELS, formatPlotFixed, isMonthKey, type FormulaKey } from "@/lib/config";
import { electricityBreakdown } from "@/lib/electricity";
import { getCurrentMonth } from "@/lib/month";
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

const PROFILE_FIELDS = [
  { key: "ratePerUnit", label: "Rate per unit (₹)", hint: "Billed on units up to the slab limit (or on every unit when the slab limit is 0).", max: 1000 },
  { key: "slabLimit", label: "Slab limit (units)", hint: "0 = one flat rate for every unit.", max: 1_000_000 },
  { key: "rateAboveLimit", label: "Rate above limit (₹/unit)", hint: "Billed on units above the slab limit.", max: 1000 },
  { key: "fppcaPerUnit", label: "FPPCA (₹/unit)", hint: "Fuel & power purchase cost adjustment, added per unit.", max: 1000 },
  { key: "surchargePerUnit", label: "Surcharge (₹/unit)", hint: "Added per unit.", max: 1000 },
  { key: "taxPercent", label: "Tax (% of energy charge)", hint: "Percentage of the energy charge.", max: 100 },
  { key: "fixedCharge", label: "Fixed charge (₹)", hint: "Added once per month, only when a meter reading exists.", max: 1_000_000 },
] as const;
type ProfileKey = (typeof PROFILE_FIELDS)[number]["key"];
type ProfileForm = Record<ProfileKey, string>;
interface ScheduleRow {
  fromMonth: string;
  formula: FormulaKey;
}

interface Form {
  flat: ProfileForm;
  slab: ProfileForm;
  schedule: ScheduleRow[];
  roundToRupee: boolean;
  high: string;
  standard: string;
  plots: string;
  limit: string;
  fixed: string;
}

const toProfileForm = (p: ElectricityConfig["formulas"][FormulaKey]): ProfileForm =>
  Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, String(p[f.key])])) as ProfileForm;
const toProfile = (f: ProfileForm) =>
  Object.fromEntries(PROFILE_FIELDS.map((p) => [p.key, Number(f[p.key])])) as Record<ProfileKey, number>;
const validProfile = (f: ProfileForm) =>
  PROFILE_FIELDS.every((p) => f[p.key].trim() !== "" && Number.isFinite(Number(f[p.key])) && Number(f[p.key]) >= 0 && Number(f[p.key]) <= p.max);

// One place to configure electricity billing, the building name and the notice on the public page.
/** Same rules the server enforces: at least one row, valid YYYY-MM months, each month only once. */
function scheduleError(rows: ScheduleRow[]): string | null {
  if (rows.length === 0) return "Keep at least one row in the formula schedule.";
  if (rows.some((r) => !isMonthKey(r.fromMonth))) return "Pick a From month for every row.";
  if (new Set(rows.map((r) => r.fromMonth)).size !== rows.length) return "Each From month can appear only once.";
  return null;
}

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
        flat: toProfileForm(settings.electricity.formulas.flat),
        slab: toProfileForm(settings.electricity.formulas.slab),
        schedule: settings.electricity.schedule.map((r) => ({ ...r })),
        roundToRupee: settings.electricity.roundToRupee,
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
      [form.high, form.standard, form.limit].some(
        (v) => v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0,
      ) ||
      !validProfile(form.flat) ||
      !validProfile(form.slab) ||
      scheduleError(form.schedule) !== null
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
            formulas: { flat: toProfile(form.flat), slab: toProfile(form.slab) },
            schedule: [...form.schedule].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth)),
            roundToRupee: form.roundToRupee,
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
      onNotify("Settings saved. Formula changes apply only to months that use that formula.");
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

  const field = (key: "high" | "standard" | "plots" | "limit" | "fixed") => ({
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
          With a current meter reading the bill follows the formula scheduled for that month (below). Until a reading
          is entered, the fixed bill applies. Changes apply only to months using that formula. Add a new From-month row
          to start a new formula without touching earlier months.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      {FORMULA_KEYS.map((key) => (
        <section key={key} className="rounded-card border border-line bg-white p-4 shadow-card">
          <h2 className="text-base font-bold text-ink">{FORMULA_LABELS[key]}</h2>
          <p className="mb-3 text-xs text-foreground/55">
            energy = units up to the slab limit × rate + the rest × rate above limit; bill = energy + units × (FPPCA +
            surcharge) + tax % of energy + fixed charge. Changes apply only to months assigned to this formula.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROFILE_FIELDS.map((f) => (
              <label key={f.key} className={labelClass}>
                {f.label}
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={f.max}
                  step="0.01"
                  className={inputClass}
                  value={form[key][f.key]}
                  onChange={(e) => setForm({ ...form, [key]: { ...form[key], [f.key]: e.target.value } })}
                />
                <span className={hintClass}>{f.hint}</span>
              </label>
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-card border border-line bg-white p-4 shadow-card">
        <h2 className="text-base font-bold text-ink">Which formula applies</h2>
        <p className="mb-3 text-xs text-foreground/55">
          A month uses the row with the latest From month on or before it; months before the first row use the flat
          formula. Changes apply only to months using that formula. Add a new From-month row to start a new formula
          without touching earlier months.
        </p>
        <ul className="flex flex-col gap-2">
          {form.schedule.map((row, index) => (
            <li key={index} className="flex flex-wrap items-end gap-2">
              <label className={labelClass}>
                From month
                <input
                  type="month"
                  className={inputClass}
                  value={row.fromMonth}
                  onChange={(e) =>
                    setForm({ ...form, schedule: form.schedule.map((r, i) => (i === index ? { ...r, fromMonth: e.target.value } : r)) })
                  }
                />
              </label>
              <label className={labelClass}>
                Formula
                <select
                  className={inputClass}
                  value={row.formula}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      schedule: form.schedule.map((r, i) => (i === index ? { ...r, formula: e.target.value as FormulaKey } : r)),
                    })
                  }
                >
                  {FORMULA_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {FORMULA_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={form.schedule.length <= 1}
                onClick={() => setForm({ ...form, schedule: form.schedule.filter((_, i) => i !== index) })}
                className="min-h-11 rounded-control border border-line-strong px-3 text-sm font-medium text-ink hover:bg-primary-light disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {scheduleError(form.schedule) && <p className="mt-2 text-xs font-medium text-unpaid">{scheduleError(form.schedule)}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                schedule: [...form.schedule, { fromMonth: nextFreeMonth(form.schedule), formula: "slab" }],
              })
            }
            className="min-h-11 rounded-control border border-line-strong px-4 text-sm font-semibold text-ink hover:bg-primary-light"
          >
            Add row
          </button>
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={form.roundToRupee}
              onChange={(e) => setForm({ ...form, roundToRupee: e.target.checked })}
            />
            Round each bill to the nearest rupee
          </label>
        </div>
      </section>

      <FormulaPreview form={form} />

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
            ? "Fix the highlighted values: non-negative numbers, and a valid, unique From month in every schedule row."
            : "Formula changes apply only to months that use that formula."}
        </span>
      </div>
    </div>
  );
}

/** The first month after the latest schedule row (or the current month), so a new row is unique by default. */
function nextFreeMonth(rows: ScheduleRow[]): string {
  const taken = new Set(rows.map((r) => r.fromMonth));
  let [y, m] = (rows.map((r) => r.fromMonth).filter(isMonthKey).sort().pop() ?? getCurrentMonth()).split("-").map(Number);
  do {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  } while (taken.has(`${y}-${String(m).padStart(2, "0")}`));
  return `${y}-${String(m).padStart(2, "0")}`;
}

// Live preview: pick a month and a unit count to see which formula applies and each line of the bill.
function FormulaPreview({ form }: { form: Form }) {
  const [month, setMonth] = useState(getCurrentMonth());
  const [units, setUnits] = useState("250");
  const rows = form.schedule.filter((r) => isMonthKey(r.fromMonth)).sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
  let key: FormulaKey = "flat";
  for (const r of rows) if (r.fromMonth <= month) key = r.formula;
  const n = Number(units);
  const ready = isMonthKey(month) && units.trim() !== "" && Number.isFinite(n) && n >= 0 && validProfile(form[key]);
  const b = ready ? electricityBreakdown(n, toProfile(form[key]), { roundToRupee: form.roundToRupee }) : null;
  const line = (label: string, value: number, strong = false) => (
    <div className={`flex justify-between ${strong ? "border-t border-line pt-1.5 font-bold text-ink" : ""}`}>
      <span>{label}</span>
      <span>₹{value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
    </div>
  );
  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-card">
      <h2 className="text-base font-bold text-ink">Preview</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Month
          <input type="month" className={inputClass} value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className={labelClass}>
          Units used
          <input type="number" inputMode="decimal" min={0} step="0.01" className={inputClass} value={units} onChange={(e) => setUnits(e.target.value)} />
        </label>
      </div>
      {b ? (
        <div className="mt-3 flex max-w-sm flex-col gap-1 text-sm text-foreground/80">
          <p className="mb-1 text-xs font-semibold text-ink">{FORMULA_LABELS[key]} applies to this month</p>
          {line(`Energy (${b.units} units)`, b.energy)}
          {line("FPPCA", b.fppca)}
          {line("Surcharge", b.surcharge)}
          {line("Tax", b.tax)}
          {line("Fixed charge", b.fixed)}
          {line("Total", b.total, true)}
        </div>
      ) : (
        <p className="mt-3 text-xs text-unpaid">Enter a month and a valid number of units.</p>
      )}
    </section>
  );
}
