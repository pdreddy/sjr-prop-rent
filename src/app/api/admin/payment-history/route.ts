import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { allPayments, allUnits, getElectricityRate } from "@/lib/store";
import { firstRentMonth, getCurrentMonth } from "@/lib/month";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { buildElectricityStatement } from "@/lib/electricityLedger";
import { expectedForMonth } from "@/lib/proration";
import type { PaymentHistoryMonth, PaymentHistoryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

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
      // Records dated before rent starts are listed (flagged) but never billed: they are normally a
      // payment filed under the move-in month that belongs to the first rent month.
      const early = first ? unitPayments.filter((p) => p.month < first) : [];
      const billable = first ? unitPayments.filter((p) => p.month >= first) : unitPayments;
      let start = first ?? billable.map((p) => p.month).sort()[0] ?? null;
      if (start && start < BUILDING_READY_MONTH) start = BUILDING_READY_MONTH;
      const statement = start && start <= currentMonth ? buildElectricityStatement(billable, rate, start, currentMonth) : [];

      const earlyRows: PaymentHistoryMonth[] = early
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((p) => ({
          month: p.month, beforeRentStart: true, recorded: true, rentDue: 0, rentPaid: p.amountPaid, rentBalance: 0,
          paidDate: p.paidDate?.toISOString() ?? null, prevReading: p.prevReading ?? 0, currReading: p.currReading ?? 0,
          electricityBill: 0, electricityPaid: 0, electricityBalance: 0, electricityStatus: "NONE" as const,
        }));
      const rows: PaymentHistoryMonth[] = statement.map((m) => {
        const record = billable.find((p) => p.month === m.month);
        const expected = expectedForMonth(unit, m.month);
        // No record yet: what was owed (prorated in the first rent month), nothing paid.
        const rentDue = record ? record.rentAmount + record.maintenanceAmount : expected.rent + expected.maintenance;
        const rentPaid = record?.amountPaid ?? 0;
        return {
          month: m.month, beforeRentStart: false, recorded: !!record, rentDue, rentPaid, rentBalance: Math.max(0, rentDue - rentPaid),
          paidDate: record?.paidDate?.toISOString() ?? null, prevReading: record?.prevReading ?? 0, currReading: record?.currReading ?? 0,
          electricityBill: m.electricityBill, electricityPaid: m.credited, electricityBalance: m.balance, electricityStatus: m.status,
        };
      });
      const months = [...earlyRows, ...rows];
      const sum = (pick: (m: PaymentHistoryMonth) => number) => months.reduce((s, m) => s + pick(m), 0);
      return {
        unitId: unit.id,
        plotNumber: unit.plotNumber,
        tenantName: unit.tenantName!.trim(),
        moveInDate: unit.moveInDate?.toISOString() ?? null,
        firstRentMonth: first,
        months,
        totals: {
          rentDue: sum((m) => m.rentDue), rentPaid: sum((m) => m.rentPaid), rentBalance: sum((m) => m.rentBalance),
          electricityBill: sum((m) => m.electricityBill), electricityPaid: sum((m) => m.electricityPaid), electricityBalance: sum((m) => m.electricityBalance),
          unusedCredit: statement.length ? statement[statement.length - 1].carriedForward : 0,
        },
      };
    });

  const response: PaymentHistoryResponse = { currentMonth, ratePerUnit: rate, tenants };
  return NextResponse.json(response);
}
