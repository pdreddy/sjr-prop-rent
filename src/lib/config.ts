// Admin-configurable settings. Shared by server and client code (no server-only imports).
// Stored in Realtime Database under settings/electricity and settings/general; the constants
// below are the fallbacks used until the admin saves something.

/** One billing formula. Flat billing is the same engine with slabLimit 0 and no extra charges. */
export interface ElectricityProfile {
  /** Units billed at `ratePerUnit`; units above it are billed at `rateAboveLimit`. 0 = one flat rate. */
  slabLimit: number;
  /** ₹ per unit (up to the slab limit). */
  ratePerUnit: number;
  /** ₹ per unit above the slab limit. */
  rateAboveLimit: number;
  /** Fuel & power purchase cost adjustment, ₹ per unit. */
  fppcaPerUnit: number;
  /** Surcharge, ₹ per unit. */
  surchargePerUnit: number;
  /** Tax as a percentage of the energy charge. */
  taxPercent: number;
  /** Fixed monthly charge (₹), billed only when a meter reading exists. */
  fixedCharge: number;
}

export type FormulaKey = "flat" | "slab";
export const FORMULA_KEYS: FormulaKey[] = ["flat", "slab"];
export const FORMULA_LABELS: Record<FormulaKey, string> = { flat: "Flat formula", slab: "Slab formula" };

/** From `fromMonth` (YYYY-MM) onward, bills use `formula` - until the next row takes over. */
export interface FormulaScheduleEntry {
  fromMonth: string;
  formula: FormulaKey;
}

export interface ElectricityConfig {
  formulas: Record<FormulaKey, ElectricityProfile>;
  /** Which formula applies from which month, sorted ascending by fromMonth (at least one row). */
  schedule: FormulaScheduleEntry[];
  /** Round each bill to the nearest rupee (shared by both formulas). */
  roundToRupee: boolean;
  /** Flat bill (₹) for plots in `highPlots` when no meter reading has been entered. */
  defaultHigh: number;
  /** Flat bill (₹) for every other plot when no meter reading has been entered. */
  defaultStandard: number;
  /** Plots billed `defaultHigh` when unread (by default the first plot on each floor). */
  highPlots: string[];
  /** Money paid above rent counts as electricity only when under this limit; larger is rent paid ahead. */
  excessLimit: number;
  /** Per-plot fixed bill (₹) used when unread; overrides the high/standard default for that plot. */
  plotFixed: Record<string, number>;
}

export interface GeneralSettings {
  buildingName: string;
  /** Show each plot's tenant name on the public page. */
  showTenantNames: boolean;
  /** Optional for legacy settings; expose only the first three characters publicly. */
  maskTenantNames?: boolean;
  /** Optional message shown at the top of the public page (e.g. "Rent is due by the 5th"). */
  notice: string;
}

export const DEFAULT_FLAT_PROFILE: ElectricityProfile = {
  slabLimit: 0,
  ratePerUnit: 7,
  rateAboveLimit: 7,
  fppcaPerUnit: 0,
  surchargePerUnit: 0,
  taxPercent: 0,
  fixedCharge: 0,
};
export const DEFAULT_SLAB_PROFILE: ElectricityProfile = {
  slabLimit: 200,
  ratePerUnit: 7.5,
  rateAboveLimit: 10,
  fppcaPerUnit: 0,
  surchargePerUnit: 0,
  taxPercent: 0,
  fixedCharge: 0,
};
// Everything up to and including October 2026 stays flat; November 2026 onward is slab.
export const DEFAULT_FORMULA_SCHEDULE: FormulaScheduleEntry[] = [
  { fromMonth: "2000-01", formula: "flat" },
  { fromMonth: "2026-11", formula: "slab" },
];

export const DEFAULT_ELECTRICITY_CONFIG: ElectricityConfig = {
  formulas: { flat: DEFAULT_FLAT_PROFILE, slab: DEFAULT_SLAB_PROFILE },
  schedule: DEFAULT_FORMULA_SCHEDULE,
  roundToRupee: true,
  defaultHigh: 750,
  defaultStandard: 500,
  highPlots: ["101", "201", "301", "401", "501"],
  excessLimit: 1500,
  plotFixed: {},
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  buildingName: process.env.BUILDING_NAME || "SJR Building",
  showTenantNames: true,
  maskTenantNames: false,
  notice: "",
};

const num = (value: unknown, fallback: number, min = 0, max = 10_000_000) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max
    ? Math.round(value * 100) / 100
    : fallback;

/** Parses "101, 201 301" or an array into a clean list of unique plot numbers. */
export function parsePlotList(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,;]+/)
      : [];
  return [...new Set(items.map((v) => String(v).trim()).filter(Boolean))].slice(
    0,
    200,
  );
}

/** Parses "101=900, 305=650" (or an object) into { plot: amount }; bad entries are ignored. */
export function parsePlotFixed(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [plot, amount] of Object.entries(value))
      if (typeof amount === "number" && amount >= 0 && amount <= 1_000_000)
        out[plot.trim()] = amount;
    return out;
  }
  if (typeof value === "string") {
    for (const part of value.split(/[,;\n]+/)) {
      const [plot, amount] = part.split(/[=:]/).map((x) => x.trim());
      const n = Number(amount);
      if (
        plot &&
        amount !== undefined &&
        amount !== "" &&
        Number.isFinite(n) &&
        n >= 0 &&
        n <= 1_000_000
      )
        out[plot] = Math.round(n * 100) / 100;
    }
  }
  return out;
}
export const formatPlotFixed = (fixed: Record<string, number>) =>
  Object.entries(fixed)
    .map(([p, a]) => `${p}=${a}`)
    .join(", ");

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonthKey = (value: unknown): value is string => typeof value === "string" && MONTH_RE.test(value);
const isFormulaKey = (value: unknown): value is FormulaKey => value === "flat" || value === "slab";

export function normalizeProfile(value: unknown, defaults: ElectricityProfile, legacyRate?: unknown): ElectricityProfile {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const rate = num(v.ratePerUnit ?? legacyRate, defaults.ratePerUnit, 0, 1000);
  return {
    slabLimit: num(v.slabLimit, defaults.slabLimit, 0, 1_000_000),
    ratePerUnit: rate,
    // A flat default follows its rate; the slab default keeps its own higher rate.
    rateAboveLimit: num(v.rateAboveLimit, defaults === DEFAULT_FLAT_PROFILE ? rate : defaults.rateAboveLimit, 0, 1000),
    fppcaPerUnit: num(v.fppcaPerUnit, defaults.fppcaPerUnit, 0, 1000),
    surchargePerUnit: num(v.surchargePerUnit, defaults.surchargePerUnit, 0, 1000),
    taxPercent: num(v.taxPercent, defaults.taxPercent, 0, 100),
    fixedCharge: num(v.fixedCharge, defaults.fixedCharge, 0, 1_000_000),
  };
}

/**
 * Accepts the schedule as an array of { fromMonth, formula }, as an object keyed by month
 * ({ "2026-11": "slab" } - how it is stored, since Realtime Database turns arrays into objects and
 * drops empty ones), or as "2000-01=flat, 2026-11=slab". Bad or duplicate rows are skipped.
 */
export function parseSchedule(value: unknown): FormulaScheduleEntry[] {
  const pairs: [unknown, unknown][] = [];
  if (Array.isArray(value)) {
    for (const row of value) {
      if (row && typeof row === "object") pairs.push([(row as FormulaScheduleEntry).fromMonth, (row as FormulaScheduleEntry).formula]);
    }
  } else if (value && typeof value === "object") {
    for (const [month, formula] of Object.entries(value)) {
      if (isFormulaKey(formula)) pairs.push([month, formula]);
      // An array stored as an object ({ "0": { fromMonth, formula } }) by the database.
      else if (formula && typeof formula === "object") pairs.push([(formula as FormulaScheduleEntry).fromMonth ?? month, (formula as FormulaScheduleEntry).formula]);
    }
  } else if (typeof value === "string") {
    for (const part of value.split(/[,;\n]+/)) {
      const [month, formula] = part.split(/[=:]/).map((x) => x.trim());
      pairs.push([month, formula]);
    }
  }
  const byMonth = new Map<string, FormulaKey>();
  for (const [month, formula] of pairs) if (isMonthKey(month) && isFormulaKey(formula) && !byMonth.has(month)) byMonth.set(month, formula);
  return [...byMonth].map(([fromMonth, formula]) => ({ fromMonth, formula })).sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
}
/** Storage form: an object keyed by month (never an empty array). */
export const scheduleToStored = (schedule: FormulaScheduleEntry[]): Record<string, FormulaKey> =>
  Object.fromEntries(schedule.map((r) => [r.fromMonth, r.formula]));

/** The formula in force for `month`: the schedule row with the latest fromMonth <= month; before the first row, flat. */
export function formulaForMonth(config: Pick<ElectricityConfig, "schedule">, month: string): FormulaKey {
  let chosen: FormulaKey = "flat";
  for (const row of config.schedule) {
    if (row.fromMonth <= month) chosen = row.formula;
    else break;
  }
  return chosen;
}
/** Used when no month is known: the formula of the latest schedule row. */
export const latestFormula = (config: Pick<ElectricityConfig, "schedule">): FormulaKey =>
  config.schedule[config.schedule.length - 1]?.formula ?? "flat";

/** Fills any missing or invalid field with its default, so partial or legacy documents still work. */
export function normalizeElectricityConfig(
  value: (Partial<Record<keyof ElectricityConfig, unknown>> & { ratePerUnit?: unknown }) | null | undefined,
): ElectricityConfig {
  const d = DEFAULT_ELECTRICITY_CONFIG;
  const formulas = (value?.formulas && typeof value.formulas === "object" ? value.formulas : {}) as Partial<Record<FormulaKey, unknown>>;
  const schedule = parseSchedule(value?.schedule);
  return {
    // A legacy document only has ratePerUnit: it becomes the flat rate.
    formulas: {
      flat: normalizeProfile(formulas.flat, DEFAULT_FLAT_PROFILE, value?.ratePerUnit),
      slab: normalizeProfile(formulas.slab, DEFAULT_SLAB_PROFILE),
    },
    schedule: schedule.length ? schedule : d.schedule.map((r) => ({ ...r })),
    roundToRupee: typeof value?.roundToRupee === "boolean" ? value.roundToRupee : d.roundToRupee,
    defaultHigh: num(value?.defaultHigh, d.defaultHigh),
    defaultStandard: num(value?.defaultStandard, d.defaultStandard),
    // Stored as a comma-separated string because Realtime Database drops empty arrays.
    highPlots:
      Array.isArray(value?.highPlots) || typeof value?.highPlots === "string"
        ? parsePlotList(value?.highPlots)
        : d.highPlots,
    excessLimit: num(value?.excessLimit, d.excessLimit),
    plotFixed: parsePlotFixed(value?.plotFixed),
  };
}

export function normalizeGeneralSettings(
  value: Partial<Record<keyof GeneralSettings, unknown>> | null | undefined,
): GeneralSettings {
  const d = DEFAULT_GENERAL_SETTINGS;
  const name =
    typeof value?.buildingName === "string"
      ? value.buildingName.trim().slice(0, 100)
      : "";
  return {
    buildingName: name || d.buildingName,
    showTenantNames:
      typeof value?.showTenantNames === "boolean"
        ? value.showTenantNames
        : d.showTenantNames,
    maskTenantNames:
      typeof value?.maskTenantNames === "boolean"
        ? value.maskTenantNames
        : false,
    notice:
      typeof value?.notice === "string"
        ? value.notice.trim().slice(0, 500)
        : d.notice,
  };
}

/** Public names are transformed before JSON serialization, including all detail views. */
export function publicTenantName(
  name: string | null,
  settings: Pick<GeneralSettings, "showTenantNames" | "maskTenantNames">,
): string | null {
  if (!settings.showTenantNames || !name?.trim()) return null;
  if (!settings.maskTenantNames) return name;
  const graphemes = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(name.trim());
  let prefix = "";
  let count = 0;
  for (const grapheme of graphemes) {
    if (count++ === 3) break;
    prefix += grapheme.segment;
  }
  return `${prefix}***`;
}
