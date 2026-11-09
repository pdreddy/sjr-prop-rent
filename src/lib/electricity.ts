import {
  DEFAULT_ELECTRICITY_CONFIG,
  DEFAULT_FLAT_PROFILE,
  formulaForMonth,
  latestFormula,
  type ElectricityConfig,
  type ElectricityProfile,
  type FormulaKey,
} from "./config";

// Electricity is billed from meter readings - units × rate, or the slab formula - and never typed in
// directly. Which of the two formulas applies is chosen per month by config.schedule. When a month has no current reading yet, a flat default is billed instead: the "high"
// amount for the plots in config.highPlots and the standard amount for every other plot.
// Everything here is admin-configurable (Settings tab); DEFAULT_ELECTRICITY_CONFIG is the fallback.
// Functions accept either a full config or, for older callers, just the rate per unit.
export type ElectricityConfigInput = ElectricityConfig | number | undefined;

export function resolveConfig(config: ElectricityConfigInput): ElectricityConfig {
  if (config === undefined) return DEFAULT_ELECTRICITY_CONFIG;
  if (typeof config !== "number") return config;
  // A bare rate (older callers) is a flat formula for every month.
  return {
    ...DEFAULT_ELECTRICITY_CONFIG,
    formulas: { ...DEFAULT_ELECTRICITY_CONFIG.formulas, flat: { ...DEFAULT_FLAT_PROFILE, ratePerUnit: config } },
    schedule: [{ fromMonth: "2000-01", formula: "flat" }],
  };
}

/** Which formula (and its parameters) bills `month`; without a month, the latest scheduled one. */
export function profileForMonth(config: ElectricityConfigInput, month?: string): { key: FormulaKey; profile: ElectricityProfile } {
  const c = resolveConfig(config);
  const key = month ? formulaForMonth(c, month) : latestFormula(c);
  return { key, profile: c.formulas[key] };
}

export interface ElectricityBreakdown {
  units: number;
  /** Slab energy charge. */
  energy: number;
  fppca: number;
  surcharge: number;
  tax: number;
  fixed: number;
  total: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * The one billing calculation. energy = min(units, slabLimit) × rate + the rest × rateAboveLimit
 * (slabLimit 0 = every unit at `rate`); bill = energy + units × (fppca + surcharge) + tax% of energy + fixed.
 * The fixed charge is only added when a meter reading exists.
 */
export function electricityBreakdown(
  rawUnits: number,
  profile: ElectricityProfile,
  options: { hasReading?: boolean; roundToRupee?: boolean } = {}
): ElectricityBreakdown {
  const { hasReading = true, roundToRupee = true } = options;
  const units = Math.round(Math.max(0, rawUnits) * 100) / 100;
  const energy =
    profile.slabLimit > 0
      ? Math.min(units, profile.slabLimit) * profile.ratePerUnit + Math.max(0, units - profile.slabLimit) * profile.rateAboveLimit
      : units * profile.ratePerUnit;
  const fppca = units * profile.fppcaPerUnit;
  const surcharge = units * profile.surchargePerUnit;
  const tax = (energy * profile.taxPercent) / 100;
  const fixed = hasReading ? profile.fixedCharge : 0;
  const sum = energy + fppca + surcharge + tax + fixed;
  return {
    units,
    energy: cents(energy),
    fppca: cents(fppca),
    surcharge: cents(surcharge),
    tax: cents(tax),
    fixed: cents(fixed),
    total: roundToRupee ? Math.round(sum) : cents(sum),
  };
}

/** Short text for "Rate X/unit" labels, e.g. "₹7/unit" or "Slab: ₹7.5/unit up to 200 units, then ₹10". */
export function describeFormula(config: ElectricityConfigInput, month?: string): string {
  const { key, profile: p } = profileForMonth(config, month);
  const extras = p.fppcaPerUnit || p.surchargePerUnit || p.taxPercent || p.fixedCharge ? " + charges" : "";
  if (p.slabLimit > 0) return `Slab: ₹${p.ratePerUnit}/unit up to ${p.slabLimit} units, then ₹${p.rateAboveLimit}/unit${extras}`;
  return key === "flat" && !extras ? `₹${p.ratePerUnit}/unit` : `₹${p.ratePerUnit}/unit${extras}`;
}

export function defaultElectricityAmount(plotNumber: string, config?: ElectricityConfigInput): number {
  const c = resolveConfig(config);
  const own = c.plotFixed?.[plotNumber.trim()];
  if (own !== undefined) return own;
  return c.highPlots.includes(plotNumber.trim()) ? c.defaultHigh : c.defaultStandard;
}

// Money paid above a month's rent is an electricity payment only when it is a small amount (₹500,
// ₹1,000, anything under the limit). A larger excess is rent paid ahead, not electricity.
export const electricityPortionOfExcess = (excess: number, config?: ElectricityConfigInput): number =>
  excess > 0 && excess < resolveConfig(config).excessLimit ? excess : 0;

/** A current reading of 0 (or none) means the meter has not been read for the month yet. */
export const hasMeterReading = (currReading: number | null | undefined): boolean => (currReading ?? 0) > 0;

// Pass the plot number to apply the no-reading default; without it only the readings are used.
// Pass the month so the formula scheduled for that month is used (earlier months keep their old formula).
export function computeElectricityAmount(
  prevReading: number,
  currReading: number,
  config?: ElectricityConfigInput,
  plotNumber?: string,
  month?: string
): number {
  const c = resolveConfig(config);
  if (plotNumber !== undefined && !hasMeterReading(currReading)) return defaultElectricityAmount(plotNumber, c);
  const { profile } = profileForMonth(c, month);
  return electricityBreakdown(currReading - prevReading, profile, { hasReading: hasMeterReading(currReading), roundToRupee: c.roundToRupee }).total;
}

export function computeElectricityUnits(prevReading: number, currReading: number): number {
  // Readings can be decimals (148.8 - 53), so round away floating-point noise like 95.80000000000001.
  return Math.round(Math.max(0, currReading - prevReading) * 100) / 100;
}
