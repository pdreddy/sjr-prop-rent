import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { allPayments, allUnits, getElectricityRate } from "@/lib/store";
import { getCurrentMonth } from "@/lib/month";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { buildElectricityStatement } from "@/lib/electricityLedger";
import type { ElectricityStatementResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// ADMIN only: the statement exposes rent and payment amounts, which the security login must not see.
export async function GET() {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const [units, payments, rate] = await Promise.all([allUnits(), allPayments(), getElectricityRate()]);
  const currentMonth = getCurrentMonth();

  const tenants = units
    .filter((unit) => unit.active && unit.tenantName?.trim())
    .map((unit) => {
      const unitPayments = payments.filter((p) => p.unitId === unit.id);
      const joinMonth = unit.moveInDate?.toISOString().slice(0, 7);
      const earliestPayment = unitPayments.map((p) => p.month).sort()[0];
      // Start at the joining month; tenants without a joining date start at their first record.
      let start = joinMonth ?? earliestPayment ?? BUILDING_READY_MONTH;
      if (start < BUILDING_READY_MONTH) start = BUILDING_READY_MONTH;
      const months = start <= currentMonth ? buildElectricityStatement(unitPayments, rate, start, currentMonth, unit.plotNumber) : [];
      return {
        unitId: unit.id,
        plotNumber: unit.plotNumber,
        tenantName: unit.tenantName,
        moveInDate: unit.moveInDate?.toISOString() ?? null,
        months,
        totals: {
          bill: months.reduce((s, m) => s + m.electricityBill, 0),
          credited: months.reduce((s, m) => s + m.credited, 0),
          balance: months.reduce((s, m) => s + m.balance, 0),
          unusedCredit: months.length ? months[months.length - 1].carriedForward : 0,
        },
      };
    });

  const response: ElectricityStatementResponse = { ratePerUnit: rate, currentMonth, tenants };
  return NextResponse.json(response);
}
