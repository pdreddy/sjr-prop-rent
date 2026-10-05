import { ELECTRICITY_RATE_PER_UNIT } from "./constants";

// Electricity is always billed from meter readings — never typed in directly — so this
// is the single place the ₹ amount gets derived from (current − previous) × rate.
// The rate is admin-configurable (see getElectricityRate in store.ts); the constant is the fallback.
export function computeElectricityAmount(
  prevReading: number,
  currReading: number,
  rate: number = ELECTRICITY_RATE_PER_UNIT
): number {
  return Math.max(0, currReading - prevReading) * rate;
}

export function computeElectricityUnits(prevReading: number, currReading: number): number {
  return Math.max(0, currReading - prevReading);
}
