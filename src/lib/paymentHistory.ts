import { firstRentMonth, isBeforeBuildingOpened } from "./month";
import { BUILDING_READY_MONTH } from "./constants";
import { buildElectricityStatement, statementStartMonth, type StatementPayment } from "./electricityLedger";
import { expectedForMonth } from "./proration";
import { computeElectricityUnits, hasMeterReading } from "./electricity";
import type { ElectricityConfig, PaymentHistoryMonth, PaymentHistoryTenant, PaymentStatus } from "./types";

/** The parts of a plot and of a month's record the ledger reads (the stored records satisfy both). */
export interface LedgerUnit {
  id: string;
  plotNumber: string;
  tenantName: string | null;
  moveInDate: Date | null;
  monthlyRent: number;
  maintenanceAmount: number;
}
export interface LedgerRecord extends StatementPayment {
  unitId: string;
  paymentStatus: PaymentStatus;
  paidDate?: Date | null;
  notes?: string | null;
  updatedBy?: string | null;
  updatedAt?: Date | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

// The one ledger for a tenant: rent (with rent paid ahead) and electricity (with its credit) month by
// month. Every tab - admin and public, month views and histories - reads its numbers from here.
export function buildPaymentHistory(
  unit: LedgerUnit,
  payments: LedgerRecord[],
  rate: ElectricityConfig,
  currentMonth: string,
): PaymentHistoryTenant {
  // A date before the building opened is a wrong year: bill nothing from it rather than from May.
  const first = isBeforeBuildingOpened(unit.moveInDate) ? null : firstRentMonth(unit.moveInDate);
  const unitPayments = payments.filter((p) => p.unitId === unit.id);
  // Same month range and electricity ledger as the Electricity bills tab, so both tabs agree:
  // from the joining month (or the earliest record) through now. Rent, though, only starts the
  // month after move-in - earlier months are flagged and never billed.
  const joinMonth = unit.moveInDate?.toISOString().slice(0, 7);
  const start = statementStartMonth(unit.moveInDate, unitPayments.map((p) => p.month), BUILDING_READY_MONTH);
  const statement = start <= currentMonth ? buildElectricityStatement(unitPayments, rate, start, currentMonth, unit.plotNumber) : [];
  let advance = 0; // rent paid ahead, e.g. a full month paid on a part-month first record

  const months: PaymentHistoryMonth[] = statement
    .map((m) => {
      const record = unitPayments.find((p) => p.month === m.month);
      const before = first !== null && m.month < first;
      if (before && !record) return null; // nothing to show for a month before rent starts
      if (first === null && !record) return null; // no move-in date: nothing is known to be owed
      const expected = expectedForMonth(unit, m.month);
      // No record yet: what was owed (prorated in the first rent month), nothing paid.
      // Before rent starts, or with no usable move-in date, nothing is billed: payments are only shown.
      const noRent = before || first === null;
      const rentDue = noRent ? 0 : record ? record.rentAmount + record.maintenanceAmount : expected.rent + expected.maintenance;
      const received = record?.amountPaid ?? 0;
      // Only a small excess over the month's rent (under ₹1,500) is an electricity payment. A larger
      // excess is rent paid ahead: it stays rent and covers any shortfall in the following months.
      const overRent = noRent ? 0 : m.excess;
      const rentPaid = received - overRent;
      let rentBalance = 0;
      // Money filed under the move-in month itself counts as rent paid ahead for the first rent month. Earlier
      // months may belong to a previous tenant of the plot, so they are shown but not applied.
      if (before && m.month === joinMonth) advance += received;
      if (!noRent) {
        const net = rentPaid + advance - rentDue;
        rentBalance = Math.max(0, -net);
        advance = Math.max(0, net);
      }
      // Status follows the ledger, so a month covered by rent paid ahead is paid. Without a usable move-in
      // date nothing is billed here, and a recorded month keeps the status saved on its record.
      const rentStatus: PaymentHistoryMonth["rentStatus"] = before
        ? "NA"
        : first === null
          ? record?.paymentStatus ?? "NA"
          : rentBalance <= 0 ? "PAID" : rentBalance < rentDue ? "PARTIAL" : "UNPAID";
      return {
        month: m.month, beforeRentStart: before, unapplied: before && m.month !== joinMonth, recorded: !!record, rentDue, rentPaid, rentBalance, rentStatus, rentAdvance: cents(advance),
        paidDate: record?.paidDate?.toISOString() ?? null, prevReading: record?.prevReading ?? 0, currReading: record?.currReading ?? 0,
        electricityBill: cents(m.electricityBill), electricityPaid: cents(overRent + (m.markedPaid ? m.electricityBill : 0)), electricityCovered: cents(m.credited),
        electricityBalance: cents(m.balance), electricityStatus: m.status, amountReceived: received,
        rentAmount: record?.rentAmount ?? expected.rent, maintenanceAmount: record?.maintenanceAmount ?? expected.maintenance,
        proratedDays: !noRent && expected.proration.prorated ? expected.proration.days : null, paymentStatus: record?.paymentStatus ?? null,
        notes: record?.notes ?? null, updatedBy: record?.updatedBy ?? null, updatedAt: record?.updatedAt?.toISOString() ?? null,
        electricityUnits: computeElectricityUnits(record?.prevReading ?? 0, record?.currReading ?? 0), electricityDefault: !!record && !hasMeterReading(record.currReading), electricityMarkedPaid: m.markedPaid,
        overpayment: overRent, creditCarriedForward: cents(m.carriedForward),
      };
    })
    .filter((m): m is PaymentHistoryMonth => m !== null);
  const sum = (pick: (m: PaymentHistoryMonth) => number) => cents(months.filter((m) => !m.unapplied).reduce((s, m) => s + pick(m), 0));
  return {
    unitId: unit.id,
    plotNumber: unit.plotNumber,
    tenantName: unit.tenantName!.trim(),
    moveInDate: unit.moveInDate?.toISOString() ?? null,
    firstRentMonth: first,
    months,
    totals: {
      totalReceived: sum((m) => m.amountReceived), rentDue: sum((m) => m.rentDue), rentPaid: sum((m) => m.rentPaid), rentBalance: sum((m) => m.rentBalance), rentAdvance: months.length ? months[months.length - 1].rentAdvance : 0,
      electricityBill: sum((m) => m.electricityBill), electricityPaid: sum((m) => m.electricityPaid), electricityBalance: sum((m) => m.electricityBalance),
      unusedCredit: statement.length ? cents(statement[statement.length - 1].carriedForward) : 0,
    },
  };
}
