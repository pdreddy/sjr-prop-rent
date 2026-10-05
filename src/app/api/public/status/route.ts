import { NextRequest, NextResponse } from "next/server";
import { allPayments, allUnits } from "@/lib/store";
import { BUILDING_NAME, BUILDING_READY_MONTH, ELECTRICITY_RATE_PER_UNIT } from "@/lib/constants";
import { isValidMonth, getCurrentMonth, isBeforeMoveInMonth } from "@/lib/month";
import { computeElectricityAmount } from "@/lib/electricity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const monthParam = request.nextUrl.searchParams.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();

  const [allUnitRecords, payments] = await Promise.all([allUnits(), allPayments()]);
  const units = allUnitRecords.filter((unit) => unit.active);
  const paymentsByUnitAndMonth = new Map(
    payments.map((payment) => [`${payment.unitId}:${payment.month}`, payment])
  );

  const plots = units.map((unit) => {
    const payment = paymentsByUnitAndMonth.get(`${unit.id}:${month}`);
    const moveInDate = unit.moveInDate?.toISOString() ?? null;
    const isBeforeMoveIn = isBeforeMoveInMonth(moveInDate, month);
    const prevReading = payment?.prevReading ?? 0;
    const currReading = payment?.currReading ?? 0;
    return {
      plotNumber: unit.plotNumber,
      tenantName: unit.tenantName,
      moveInDate,
      status: isBeforeMoveIn ? ("NA" as const) : payment?.paymentStatus ?? ("UNPAID" as const),
      paidDate: payment?.paidDate?.toISOString() ?? null,
      electricityStatus: isBeforeMoveIn ? ("NA" as const) : payment?.electricityPaid ? ("PAID" as const) : ("UNPAID" as const),
      electricityAmount: computeElectricityAmount(prevReading, currReading),
      prevReading,
      currReading,
    };
  });

  const paidCount = plots.filter((p) => p.status === "PAID").length;

  // Give residents one transparent, building-wide view of everything still due.
  // Missing payment records count as the unit's standard rent + maintenance;
  // electricity can only be due once meter readings have created a bill.
  const currentMonth = getCurrentMonth();
  const pendingMonths = new Set<string>();
  for (let cursor = currentMonth; cursor >= BUILDING_READY_MONTH; ) {
    pendingMonths.add(cursor);
    const [year, monthNumber] = cursor.split("-").map(Number);
    const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
    cursor = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  for (const payment of payments) {
    if (payment.month <= currentMonth) pendingMonths.add(payment.month);
  }

  const pendingByMonth = [...pendingMonths]
    .sort((a, b) => b.localeCompare(a))
    .map((pendingMonth) => {
      let rent = 0;
      let electricity = 0;
      let pendingRentCount = 0;
      let pendingElectricityCount = 0;

      for (const unit of units) {
        if (isBeforeMoveInMonth(unit.moveInDate, pendingMonth)) continue;
        const payment = paymentsByUnitAndMonth.get(`${unit.id}:${pendingMonth}`);
        const rentDue = Math.max(
          0,
          payment?.balanceDue ?? unit.monthlyRent + unit.maintenanceAmount
        );
        if (rentDue > 0) {
          rent += rentDue;
          pendingRentCount += 1;
        }

        const electricityDue = payment && !payment.electricityPaid
          ? computeElectricityAmount(payment.prevReading ?? 0, payment.currReading ?? 0)
          : 0;
        if (electricityDue > 0) {
          electricity += electricityDue;
          pendingElectricityCount += 1;
        }
      }

      return {
        month: pendingMonth,
        rent,
        electricity,
        balance: rent + electricity,
        pendingRentCount,
        pendingElectricityCount,
      };
    })
    .filter((item) => item.rent > 0 || item.electricity > 0);

  return NextResponse.json({
    buildingName: BUILDING_NAME,
    month,
    totalPlots: plots.length,
    paidCount,
    plots,
    pendingSummary: {
      electricityRatePerUnit: ELECTRICITY_RATE_PER_UNIT,
      totalRent: pendingByMonth.reduce((sum, item) => sum + item.rent, 0),
      totalElectricity: pendingByMonth.reduce((sum, item) => sum + item.electricity, 0),
      totalBalance: pendingByMonth.reduce((sum, item) => sum + item.balance, 0),
      months: pendingByMonth,
    },
  });
}
