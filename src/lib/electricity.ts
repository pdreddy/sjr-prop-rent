import { ELECTRICITY_RATE_PER_UNIT } from "./constants";

// Electricity is billed from meter readings - (current − previous) × rate - and never typed in
// directly. When a month has no current reading yet, a flat default is billed instead: ₹750 for
// the plots in DEFAULT_HIGH_PLOTS (the first plot on each floor) and ₹500 for every other plot.
// The rate is admin-configurable (see getElectricityRate in store.ts); the constant is the fallback.
export const DEFAULT_HIGH_PLOTS = ["101", "201", "301", "401", "501"];
export const DEFAULT_ELECTRICITY_HIGH = 750;
export const DEFAULT_ELECTRICITY_STANDARD = 500;

export function defaultElectricityAmount(plotNumber: string): number {
  return DEFAULT_HIGH_PLOTS.includes(plotNumber.trim()) ? DEFAULT_ELECTRICITY_HIGH : DEFAULT_ELECTRICITY_STANDARD;
}

/** A current reading of 0 (or none) means the meter has not been read for the month yet. */
export const hasMeterReading = (currReading: number | null | undefined): boolean => (currReading ?? 0) > 0;

// Pass the plot number to apply the no-reading default; without it only the readings are used.
export function computeElectricityAmount(
  prevReading: number,
  currReading: number,
  rate: number = ELECTRICITY_RATE_PER_UNIT,
  plotNumber?: string
): number {
  if (plotNumber !== undefined && !hasMeterReading(currReading)) return defaultElectricityAmount(plotNumber);
  return Math.max(0, currReading - prevReading) * rate;
}

export function computeElectricityUnits(prevReading: number, currReading: number): number {
  return Math.max(0, currReading - prevReading);
}
