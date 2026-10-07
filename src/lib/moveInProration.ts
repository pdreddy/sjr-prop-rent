// Move-in month rent for a tenant. Every month is billed as 30 days regardless of its real length,
// and the move-in day itself counts: moving in on the 10th charges 30 - 10 + 1 = 21 days.
// Pure functions only, so the Move-in Proration tab recalculates live as inputs change.
export const BILLING_DAYS = 30;

export interface MoveInInput {
  moveInDate: string | null;
  monthlyRent: number;
  maintenanceAmount: number;
  /** Rent actually received by the 10th of the month after move-in. null/blank = nothing recorded. */
  paidByTenth: number | null;
}

export interface MoveInCalc {
  moveInMonth: string;
  daysCharged: number;
  /** Monthly rent + maintenance. */
  totalMonthlyRent: number;
  dailyRate: number;
  proratedRent: number;
  paid: number;
  /** Part of the payment that covered the prorated rent. */
  rentCovered: number;
  /** Anything paid above the prorated rent. */
  electricityCredit: number;
  remainingBalance: number;
}

export interface MoveInTotals {
  proratedRent: number;
  paid: number;
  electricityCredit: number;
  remainingBalance: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Days charged for a move-in on `day` of the month (1-31): 30 - day + 1, never below 1. */
export function moveInDaysCharged(day: number): number {
  return Math.max(1, Math.min(BILLING_DAYS, BILLING_DAYS - day + 1));
}

export function calcMoveIn(input: MoveInInput): MoveInCalc | null {
  const match = input.moveInDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const daysCharged = moveInDaysCharged(Number(match[3]));
  const totalMonthlyRent = input.monthlyRent + input.maintenanceAmount;
  const dailyRate = totalMonthlyRent / BILLING_DAYS;
  const proratedRent = Math.round(totalMonthlyRent * daysCharged / BILLING_DAYS);
  const paid = Math.max(0, input.paidByTenth ?? 0);
  return {
    moveInMonth: `${match[1]}-${match[2]}`,
    daysCharged,
    totalMonthlyRent,
    dailyRate,
    proratedRent,
    paid,
    rentCovered: Math.min(paid, proratedRent), // 1. prorated rent is covered first
    electricityCredit: cents(Math.max(0, paid - proratedRent)), // 2. any excess becomes electricity credit
    remainingBalance: cents(Math.max(0, proratedRent - paid)), // 3. any shortfall stays as rent balance
  };
}

export function sumMoveIn(calcs: (MoveInCalc | null)[]): MoveInTotals {
  const totals: MoveInTotals = { proratedRent: 0, paid: 0, electricityCredit: 0, remainingBalance: 0 };
  for (const c of calcs) {
    if (!c) continue;
    totals.proratedRent += c.proratedRent;
    totals.paid += c.paid;
    totals.electricityCredit += c.electricityCredit;
    totals.remainingBalance += c.remainingBalance;
  }
  return {
    proratedRent: cents(totals.proratedRent),
    paid: cents(totals.paid),
    electricityCredit: cents(totals.electricityCredit),
    remainingBalance: cents(totals.remainingBalance),
  };
}
