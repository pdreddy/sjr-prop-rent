import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { allPayments, allUnits, getElectricityRate } from "@/lib/store";
import { firstRentMonth, getCurrentMonth } from "@/lib/month";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { buildElectricityStatement } from "@/lib/electricityLedger";
import { expectedForMonth } from "@/lib/proration";
import { hasMeterReading } from "@/lib/electricity";
import type { PaymentHistoryMonth, PaymentHistoryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// Meter readings are decimals (e.g. 271.3), so round money to paise to avoid 1899.1000000000001.
const cents = (n: number) => Math.round(n * 100) / 100;

export async function GET() {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const [units, payments, rate] = await Promise.all([allUnits(), allPayments(), getElectricityRate()]);
  const currentMonth = getCurrentMonth();

  const tenants = units
    .filter((unit) => unit.active && unit.tenantName?.trim())
    .map((unit) => {
      const first = firstRentMonth(unit.moveInDate);
      const unitPayments = payments.filter((p) => p.unitId === unit.id);
      // Same month range and electricity ledger as the Electricity bills tab, so both tabs agree:
      // from the joining month (or the earliest record) through now. Rent, though, only starts the
      // month after move-in - earlier months are flagged and never billed.
      const joinMonth = unit.moveInDate?.toISOString().slice(0, 7);
      let start = joinMonth ?? unitPayments.map((p) => p.month).sort()[0] ?? BUILDING_READY_MONTH;
      if (start < BUILDING_READY_MONTH) start = BUILDING_READY_MONTH;
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
          const rentDue = before ? 0 : record ? record.rentAmount + record.maintenanceAmount : expected.rent + expected.maintenance;
          const received = record?.amountPaid ?? 0;
          // Only a small excess over the month's rent (under ₹1,500) is an electricity payment. A larger
          // excess is rent paid ahead: it stays rent and covers any shortfall in the following months.
          const overRent = before ? 0 : m.excess;
          const rentPaid = received - overRent;
          let rentBalance = 0;
          if (!before) {
            const net = rentPaid + advance - rentDue;
            rentBalance = Math.max(0, -net);
            advance = Math.max(0, net);
          }
          return {
            month: m.month, beforeRentStart: before, recorded: !!record, rentDue, rentPaid, rentBalance, rentAdvance: cents(advance),
            paidDate: record?.paidDate?.toISOString() ?? null, prevReading: record?.prevReading ?? 0, currReading: record?.currReading ?? 0,
            electricityBill: cents(m.electricityBill), electricityPaid: cents(overRent + (m.markedPaid ? m.electricityBill : 0)), electricityCovered: cents(m.credited),
            electricityBalance: cents(m.balance), electricityStatus: m.status, amountReceived: received,
            rentAmount: record?.rentAmount ?? expected.rent, maintenanceAmount: record?.maintenanceAmount ?? expected.maintenance,
            proratedDays: !before && expected.proration.prorated ? expected.proration.days : null, paymentStatus: record?.paymentStatus ?? null,
            notes: record?.notes ?? null, updatedBy: record?.updatedBy ?? null, updatedAt: record?.updatedAt?.toISOString() ?? null,
            electricityUnits: Math.max(0, (record?.currReading ?? 0) - (record?.prevReading ?? 0)), electricityDefault: !!record && !hasMeterReading(record.currReading), electricityMarkedPaid: m.markedPaid,
            overpayment: overRent, creditCarriedForward: cents(m.carriedForward),
          };
        })
        .filter((m): m is PaymentHistoryMonth => m !== null);
      const sum = (pick: (m: PaymentHistoryMonth) => number) => cents(months.reduce((s, m) => s + pick(m), 0));
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
    });

  const response: PaymentHistoryResponse = { currentMonth, ratePerUnit: rate, tenants };
  return NextResponse.json(response);
}
