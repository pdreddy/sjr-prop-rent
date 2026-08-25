import { ELECTRICITY_RATE_PER_UNIT } from "./constants";

// Electricity is always billed from meter readings — never typed in directly — so this
// is the single place the ₹ amount gets derived from (current − previous) × rate.
export function computeElectricityAmount(prevReading: number, currReading: number): number {
  return Math.max(0, currReading - prevReading) * ELECTRICITY_RATE_PER_UNIT;
}

export function computeElectricityUnits(prevReading: number, currReading: number): number {
  return Math.max(0, currReading - prevReading);
}
