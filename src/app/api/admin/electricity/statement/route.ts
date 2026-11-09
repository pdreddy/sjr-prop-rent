import { withErrorHandling } from "@/lib/apiHandler";
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { profileForMonth } from "@/lib/electricity";
import { allPayments, allUnits, getElectricityConfig } from "@/lib/store";
import { getCurrentMonth } from "@/lib/month";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { buildElectricityStatement, statementStartMonth } from "@/lib/electricityLedger";
import type { ElectricityStatementResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// ADMIN only: the statement exposes rent and payment amounts, which the security login must not see.
export const GET = withErrorHandling(async () => {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const [units, payments, rate] = await Promise.all([allUnits(), allPayments(), getElectricityConfig()]);
  const currentMonth = getCurrentMonth();

  const tenants = units
    .filter((unit) => unit.active && unit.tenantName?.trim())
    .map((unit) => {
      const unitPayments = payments.filter((p) => p.unitId === unit.id);
      // Same first month as every other tab (joining month, or the first record without a joining date).
      const start = statementStartMonth(unit.moveInDate, unitPayments.map((p) => p.month), BUILDING_READY_MONTH);
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

  const response: ElectricityStatementResponse = { ratePerUnit: profileForMonth(rate, currentMonth).profile.ratePerUnit, config: rate, currentMonth, tenants };
  return NextResponse.json(response);
});
