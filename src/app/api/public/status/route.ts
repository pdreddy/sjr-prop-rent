import { NextRequest, NextResponse } from "next/server";
import { allPayments, allUnits, getElectricityRate } from "@/lib/store";
import { BUILDING_NAME } from "@/lib/constants";
import { isValidMonth, getCurrentMonth, isBeforeMoveInMonth } from "@/lib/month";
import { computeElectricityAmount } from "@/lib/electricity";

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
    const prevReading = payment?.prevReading ?? 0;
    const currReading = payment?.currReading ?? 0;
    const unpaidElectricityMonths = payments
      .filter((item) => item.unitId === unit.id && !item.electricityPaid && !isBeforeMoveInMonth(moveInDate, item.month))
      .map((item) => ({
        month: item.month,
        amount: computeElectricityAmount(item.prevReading ?? 0, item.currReading ?? 0, rate),
      }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => a.month.localeCompare(b.month));
    const unpaidElectricityTotal = unpaidElectricityMonths.reduce((sum, item) => sum + item.amount, 0);
    return {
      unpaidElectricityTotal,
      unpaidElectricityMonths,
      plotNumber: unit.plotNumber,
      tenantName: unit.tenantName,
      moveInDate,
      status: isBeforeMoveIn ? ("NA" as const) : payment?.paymentStatus ?? ("UNPAID" as const),
      paidDate: payment?.paidDate?.toISOString() ?? null,
      electricityStatus: isBeforeMoveIn ? ("NA" as const) : payment?.electricityPaid ? ("PAID" as const) : ("UNPAID" as const),
      electricityAmount: computeElectricityAmount(prevReading, currReading, rate),
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
