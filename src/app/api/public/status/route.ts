import { NextRequest, NextResponse } from "next/server";
import { allPayments, allUnits, getElectricityRate } from "@/lib/store";
import { BUILDING_NAME, PUBLIC_SHOW_TENANT_NAME } from "@/lib/constants";
import { isValidMonth, getCurrentMonth, isBeforeMoveInMonth, isBeforeFirstRentMonth, isRentOverdue } from "@/lib/month";
import { computeElectricityAmount } from "@/lib/electricity";
import { buildElectricityLedger } from "@/lib/electricityLedger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const monthParam = request.nextUrl.searchParams.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();

  const [allUnitRecords, payments, rate] = await Promise.all([allUnits(), allPayments(), getElectricityRate()]);
  const units = allUnitRecords.filter((unit) => unit.active);

  const plots = units.map((unit) => {
    const payment = payments.find((item) => item.unitId === unit.id && item.month === month);
    const moveInDate = unit.moveInDate?.toISOString() ?? null;
    const isBeforeMoveIn = isBeforeMoveInMonth(moveInDate, month);
    const isBeforeFirstRent = isBeforeFirstRentMonth(moveInDate, month);
    const prevReading = payment?.prevReading ?? 0;
    const currReading = payment?.currReading ?? 0;
    const ledger = buildElectricityLedger(
      payments.filter((item) => item.unitId === unit.id && !isBeforeMoveInMonth(moveInDate, item.month)),
      rate,
      unit.plotNumber
    );
    const thisMonth = ledger.find((entry) => entry.month === month);
    const unpaidElectricityMonths = ledger
      .filter((entry) => entry.balance > 0)
      .map((entry) => ({ month: entry.month, bill: entry.bill, paid: entry.paid, amount: entry.balance }));
    const unpaidElectricityTotal = unpaidElectricityMonths.reduce((sum, item) => sum + item.amount, 0);
    return {
      unpaidElectricityTotal,
      unpaidElectricityMonths,
      plotNumber: unit.plotNumber,
      tenantName: PUBLIC_SHOW_TENANT_NAME ? unit.tenantName : null,
      moveInDate,
      status: isBeforeFirstRent
        ? ("NA" as const)
        : (payment?.paymentStatus ?? "UNPAID") === "UNPAID" && !isRentOverdue(month)
          ? ("DUE" as const)
          : payment?.paymentStatus ?? ("UNPAID" as const),
      paidDate: payment?.paidDate?.toISOString() ?? null,
      electricityStatus: isBeforeMoveIn
        ? ("NA" as const)
        : payment?.electricityPaid || (thisMonth && thisMonth.bill > 0 && thisMonth.balance <= 0)
          ? ("PAID" as const)
          : ("UNPAID" as const),
      electricityAmount: computeElectricityAmount(prevReading, currReading, rate, unit.plotNumber),
      electricityCovered: thisMonth?.paid ?? 0,
      electricityBalance: thisMonth?.balance ?? 0,
      prevReading,
      currReading,
    };
  });

  const paidCount = plots.filter((p) => p.status === "PAID").length;

  return NextResponse.json({
    buildingName: BUILDING_NAME,
    ratePerUnit: rate,
    month,
    totalPlots: plots.length,
    paidCount,
    plots,
  });
}
