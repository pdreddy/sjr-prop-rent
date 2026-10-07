import { firstRentMonth } from "./month";

// A tenant's first rent record is the month AFTER move-in (see firstRentMonth) and holds the rent for
// the move-in month, which covers only the days actually stayed. Months are always treated as 30
// days (rent / 30 per day) and the move-in day itself counts: moving in on the 10th is 30 - 10 + 1 =
// 21 days -> rent x 21 / 30. Moving in on the 1st is a full month. Every later record is full rent.
export interface Proration {
  /** Days charged in the month (1–30). */
  days: number;
  /** days / 30 */
  factor: number;
  prorated: boolean;
}

const FULL: Proration = { days: 30, factor: 1, prorated: false };

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function moveInProration(moveInDate: string | Date | null, month: string): Proration {
  if (!moveInDate || firstRentMonth(moveInDate) !== month) return FULL;
  const iso = moveInDate instanceof Date ? moveInDate.toISOString() : moveInDate;
  const day = Number(iso.slice(8, 10));
  const days = Math.max(1, Math.min(30, 30 - day + 1));
  return days >= 30 ? FULL : { days, factor: days / 30, prorated: true };
}

export function prorate(amount: number, p: Proration): number {
  return p.prorated ? Math.round(amount * p.factor) : amount;
}

/** What a unit owes (rent, maintenance) for `month`, prorated if it is the move-in month. */
export function expectedForMonth(
  unit: { monthlyRent: number; maintenanceAmount: number; moveInDate: string | Date | null },
  month: string
) {
  const p = moveInProration(unit.moveInDate, month);
  return { rent: prorate(unit.monthlyRent, p), maintenance: prorate(unit.maintenanceAmount, p), proration: p };
}
