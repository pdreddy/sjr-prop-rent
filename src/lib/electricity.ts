import { DEFAULT_ELECTRICITY_CONFIG, type ElectricityConfig } from "./config";

// Electricity is billed from meter readings - (current − previous) × rate - and never typed in
// directly. When a month has no current reading yet, a flat default is billed instead: the "high"
// amount for the plots in config.highPlots and the standard amount for every other plot.
// Everything here is admin-configurable (Settings tab); DEFAULT_ELECTRICITY_CONFIG is the fallback.
// Functions accept either a full config or, for older callers, just the rate per unit.
export type ElectricityConfigInput = ElectricityConfig | number | undefined;

export function resolveConfig(config: ElectricityConfigInput): ElectricityConfig {
  if (config === undefined) return DEFAULT_ELECTRICITY_CONFIG;
  return typeof config === "number" ? { ...DEFAULT_ELECTRICITY_CONFIG, ratePerUnit: config } : config;
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

export interface ElectricityBreakdown {
  units: number;
  energy: number;
  fppca: number;
  surcharge: number;
  tax: number;
  fixed: number;
  total: number;
}

const money = (n: number) => Math.round(n * 100) / 100;

// The full bill for a number of units. Slab: the first slabLimit units cost ratePerUnit each, every unit
// beyond costs rateAboveLimit (slabLimit 0 = one flat rate). Tax applies to the energy charge only.
export function electricityBreakdown(units: number, config?: ElectricityConfigInput): ElectricityBreakdown {
  const c = resolveConfig(config);
  const u = Math.max(0, units);
  const low = c.slabLimit > 0 ? Math.min(u, c.slabLimit) : u;
  const high = u - low;
  const energy = low * c.ratePerUnit + high * c.rateAboveLimit;
  const fppca = u * c.fppcaPerUnit;
  const surcharge = u * c.surchargePerUnit;
  const tax = (energy * c.taxPercent) / 100;
  const fixed = u > 0 ? c.fixedCharge : 0;
  const raw = energy + fppca + surcharge + tax + fixed;
  return {
    units: u,
    energy: money(energy),
    fppca: money(fppca),
    surcharge: money(surcharge),
    tax: money(tax),
    fixed: money(fixed),
    total: c.roundToRupee ? Math.round(raw) : money(raw),
  };
}

// Pass the plot number to apply the no-reading default; without it only the readings are used.
export function computeElectricityAmount(
  prevReading: number,
  currReading: number,
  config?: ElectricityConfigInput,
  plotNumber?: string
): number {
  const c = resolveConfig(config);
  if (plotNumber !== undefined && !hasMeterReading(currReading)) return defaultElectricityAmount(plotNumber, c);
  return electricityBreakdown(computeElectricityUnits(prevReading, currReading), c).total;
}

export function computeElectricityUnits(prevReading: number, currReading: number): number {
  // Readings can be decimals (148.8 - 53), so round away floating-point noise like 95.80000000000001.
  return Math.round(Math.max(0, currReading - prevReading) * 100) / 100;
}
