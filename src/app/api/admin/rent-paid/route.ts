import { withErrorHandling } from "@/lib/apiHandler";
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { allPayments, allUnits, getElectricityConfig } from "@/lib/store";
import { getCurrentMonth } from "@/lib/month";
import { buildPaymentHistory } from "@/lib/paymentHistory";
import type { RentPaidResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const [units, payments, electricityConfig] = await Promise.all([allUnits(), allPayments(), getElectricityConfig()]);
  const currentMonth = getCurrentMonth();

  const response: RentPaidResponse = {
    currentMonth,
    config: electricityConfig,
    tenants: units
      .filter((unit) => unit.active && unit.tenantName?.trim())
      .map((unit) => {
        // Totals of the tenant's ledger - the same one the Payment history tab lists month by month.
        const ledger = buildPaymentHistory(unit, payments, electricityConfig, currentMonth);
        const counted = ledger.months.filter((m) => !m.unapplied);
        const billed = ledger.firstRentMonth === null ? [] : counted.filter((m) => !m.beforeRentStart);
        const lastPaid = counted.filter((m) => m.rentPaid > 0 && m.paidDate).map((m) => m.paidDate!).sort().pop() ?? null;
        return {
          unitId: unit.id,
          plotNumber: unit.plotNumber,
          tenantName: ledger.tenantName,
          moveInDate: ledger.moveInDate,
          firstRentMonth: ledger.firstRentMonth,
          monthsBilled: billed.length,
          monthsPaid: billed.filter((m) => m.rentDue > 0 && m.rentBalance <= 0).length,
          totalDue: ledger.totals.rentDue,
          totalPaid: ledger.totals.rentPaid,
          overRent: Math.round(counted.reduce((sum, m) => sum + m.overpayment, 0) * 100) / 100,
          balance: ledger.totals.rentBalance,
          lastPaidDate: lastPaid,
        };
      }),
  };
  return NextResponse.json(response);
});
