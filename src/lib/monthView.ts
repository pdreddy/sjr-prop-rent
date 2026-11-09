import { isBeforeFirstRentMonth } from "./month";
import { buildPaymentHistory, type LedgerRecord, type LedgerUnit } from "./paymentHistory";
import { expectedForMonth } from "./proration";
import { hasMeterReading } from "./electricity";
import type { ElectricityConfig, PaymentHistoryTenant, PaymentStatus, UnitMonthView } from "./types";

const cents = (n: number) => Math.round(n * 100) / 100;

const EMPTY: UnitMonthView = {
  isVacant: false,
  applicable: false,
  rent: { status: "NA", due: 0, received: 0, balance: 0 },
  electricity: { status: "NA", bill: 0, covered: 0, balance: 0, outstandingTotal: 0, hasReading: false },
};

/** The ledger of every occupied plot, keyed by unit id (vacant plots have none). */
export function buildLedgers(units: LedgerUnit[], payments: LedgerRecord[], config: ElectricityConfig, throughMonth: string): Map<string, PaymentHistoryTenant> {
  const ledgers = new Map<string, PaymentHistoryTenant>();
  for (const unit of units) {
    if (unit.tenantName?.trim()) ledgers.set(unit.id, buildPaymentHistory(unit, payments, config, throughMonth));
  }
  return ledgers;
}

/**
 * One plot in one month, read from its ledger: the rent and electricity numbers every month-based
 * screen shows (Overview, Summary, Meter readings, the public page). Histories show the same ledger
 * month by month, so a figure can never differ between two tabs.
 */
export function buildUnitMonthView(
  unit: LedgerUnit,
  ledger: PaymentHistoryTenant | null | undefined,
  record: LedgerRecord | null | undefined,
  month: string,
): UnitMonthView {
  if (!unit.tenantName?.trim() || !ledger) return { ...EMPTY, isVacant: !unit.tenantName?.trim() };
  const row = ledger.months.find((m) => m.month === month && !m.unapplied);
  const rentStarted = !isBeforeFirstRentMonth(unit.moveInDate, month);

  let rent: UnitMonthView["rent"] = EMPTY.rent;
  if (rentStarted && row && ledger.firstRentMonth !== null) {
    rent = { status: row.rentStatus, due: row.rentDue, received: row.amountReceived, balance: cents(row.rentBalance) };
  } else if (rentStarted) {
    // No usable move-in date (or a month outside the ledger): only this month's own record is known.
    const expected = expectedForMonth(unit, month);
    const due = record ? record.rentAmount + record.maintenanceAmount : expected.rent + expected.maintenance;
    const received = record?.amountPaid ?? 0;
    const status: PaymentStatus = record?.paymentStatus ?? "UNPAID";
    rent = { status, due, received, balance: cents(Math.max(0, due - received)) };
  }

  // A month is billed for electricity only once it has a record; until then there is no bill.
  const billed = row?.recorded && row.electricityStatus !== "NONE" ? row : null;
  return {
    isVacant: false,
    applicable: rentStarted,
    rent,
    electricity: {
      status: billed ? (billed.electricityStatus as "PAID" | "PARTIAL" | "UNPAID") : "NA",
      bill: billed?.electricityBill ?? 0,
      covered: billed?.electricityCovered ?? 0,
      balance: billed?.electricityBalance ?? 0,
      outstandingTotal: ledger.totals.electricityBalance,
      hasReading: hasMeterReading(record?.currReading),
    },
  };
}
