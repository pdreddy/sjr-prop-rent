import { computeElectricityAmount } from "./electricity";

export interface LedgerPayment {
  month: string;
  rentAmount: number;
  maintenanceAmount: number;
  amountPaid: number;
  prevReading?: number | null;
  currReading?: number | null;
  electricityPaid?: boolean | null;
}

export interface LedgerEntry {
  month: string;
  bill: number;
  /** Part of the bill covered by overpaid rent (or the whole bill if marked paid manually). */
  paid: number;
  balance: number;
}

// Anything a tenant pays over rent + maintenance is treated as an electricity payment.
// Those overpayments form a running credit that is applied to the electricity bills
// oldest-first, so e.g. a ₹500 overpayment in an earlier month covers that month's bill
// and whatever is left carries forward to the next. A bill marked paid by hand is
// settled as-is and does not draw on the credit.
export function buildElectricityLedger(payments: LedgerPayment[], rate: number): LedgerEntry[] {
  const sorted = [...payments].sort((a, b) => a.month.localeCompare(b.month));
  let credit = 0;
  return sorted.map((p) => {
    credit += Math.max(0, p.amountPaid - (p.rentAmount + p.maintenanceAmount));
    const bill = computeElectricityAmount(p.prevReading ?? 0, p.currReading ?? 0, rate);
    if (p.electricityPaid) return { month: p.month, bill, paid: bill, balance: 0 };
    const paid = Math.min(credit, bill);
    credit -= paid;
    return { month: p.month, bill, paid, balance: bill - paid };
  });
}
