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

// ---- Month-by-month statement per tenant (admin "Electricity bills" tab) ----

export type ElectricityMonthStatus = "PAID" | "PARTIAL" | "UNPAID" | "NONE";

export interface StatementMonth {
  month: string;
  /** False when no payment record exists for the month at all. */
  recorded: boolean;
  rentAmount: number;
  maintenanceAmount: number;
  /** Rent + maintenance: the baseline a payment has to cover before it counts as electricity. */
  baseline: number;
  totalPaid: number;
  /** Amount paid over the baseline in this month. */
  excess: number;
  /** Overpayment credit (this month's plus carried forward) applied to this month's bill. */
  credited: number;
  /** Unused credit carried into the following months. */
  carriedForward: number;
  electricityBill: number;
  balance: number;
  markedPaid: boolean;
  status: ElectricityMonthStatus;
}

export interface StatementPayment extends LedgerPayment {
  month: string;
}

export function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  let [y, m] = start.split("-").map(Number);
  const [endY, endM] = end.split("-").map(Number);
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

// Every month from the tenant's joining month through `currentMonth`, including months
// with no payment record (shown as NONE), each with the numbers that produced its status.
export function buildElectricityStatement(
  payments: StatementPayment[],
  rate: number,
  startMonth: string,
  currentMonth: string
): StatementMonth[] {
  const byMonth = new Map(payments.map((p) => [p.month, p]));
  let credit = 0;
  return monthsBetween(startMonth, currentMonth).map((month) => {
    const p = byMonth.get(month);
    if (!p) {
      return {
        month, recorded: false, rentAmount: 0, maintenanceAmount: 0, baseline: 0, totalPaid: 0, excess: 0,
        credited: 0, carriedForward: credit, electricityBill: 0, balance: 0, markedPaid: false, status: "NONE" as const,
      };
    }
    const baseline = p.rentAmount + p.maintenanceAmount;
    const excess = Math.max(0, p.amountPaid - baseline);
    credit += excess;
    const bill = computeElectricityAmount(p.prevReading ?? 0, p.currReading ?? 0, rate);
    const markedPaid = !!p.electricityPaid;
    let credited = 0;
    let balance = 0;
    if (markedPaid) {
      credited = bill;
    } else {
      credited = Math.min(credit, bill);
      credit -= credited;
      balance = bill - credited;
    }
    let status: ElectricityMonthStatus;
    if (bill <= 0 && !markedPaid) status = "NONE"; // no meter reading to bill yet
    else if (markedPaid || balance <= 0) status = "PAID";
    else if (credited > 0) status = "PARTIAL";
    else status = "UNPAID";
    return {
      month, recorded: true, rentAmount: p.rentAmount, maintenanceAmount: p.maintenanceAmount, baseline,
      totalPaid: p.amountPaid, excess, credited, carriedForward: credit, electricityBill: bill, balance,
      markedPaid, status,
    };
  });
}
