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
  return c.highPlots.includes(plotNumber.trim()) ? c.defaultHigh : c.defaultStandard;
}

// Money paid above a month's rent is an electricity payment only when it is a small amount (₹500,
// ₹1,000, anything under the limit). A larger excess is rent paid ahead, not electricity.
export const electricityPortionOfExcess = (excess: number, config?: ElectricityConfigInput): number =>
  excess > 0 && excess < resolveConfig(config).excessLimit ? excess : 0;

/** A current reading of 0 (or none) means the meter has not been read for the month yet. */
export const hasMeterReading = (currReading: number | null | undefined): boolean => (currReading ?? 0) > 0;

// Pass the plot number to apply the no-reading default; without it only the readings are used.
export function computeElectricityAmount(
  prevReading: number,
  currReading: number,
  config?: ElectricityConfigInput,
  plotNumber?: string
): number {
  const c = resolveConfig(config);
  if (plotNumber !== undefined && !hasMeterReading(currReading)) return defaultElectricityAmount(plotNumber, c);
  return Math.max(0, currReading - prevReading) * c.ratePerUnit;
}

export function computeElectricityUnits(prevReading: number, currReading: number): number {
  // Readings can be decimals (148.8 - 53), so round away floating-point noise like 95.80000000000001.
  return Math.round(Math.max(0, currReading - prevReading) * 100) / 100;
}
