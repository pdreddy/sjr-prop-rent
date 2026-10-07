import { NextRequest, NextResponse } from "next/server";
import { allPayments, allUnits, getElectricityRate } from "@/lib/store";
import { BUILDING_NAME, PUBLIC_SHOW_TENANT_NAME } from "@/lib/constants";
import { isValidMonth, getCurrentMonth, isBeforeMoveInMonth, isBeforeFirstRentMonth, isRentOverdue } from "@/lib/month";
import { computeElectricityAmount, computeElectricityUnits, hasMeterReading } from "@/lib/electricity";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { buildElectricityLedger, buildElectricityStatement } from "@/lib/electricityLedger";

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
    // The no-reading default bill only applies to an occupied plot (not vacant, not before move-in).
    const billPlot = unit.tenantName?.trim() && !isBeforeMoveIn ? unit.plotNumber : undefined;
    const prevReading = payment?.prevReading ?? 0;
    const currReading = payment?.currReading ?? 0;
    const ledger = buildElectricityLedger(
      payments.filter((item) => item.unitId === unit.id && !isBeforeMoveInMonth(moveInDate, item.month)),
      rate,
      billPlot
    );
    const thisMonth = ledger.find((entry) => entry.month === month);
    const unpaidElectricityMonths = ledger
      .filter((entry) => entry.balance > 0)
      .map((entry) => ({ month: entry.month, bill: entry.bill, paid: entry.paid, amount: entry.balance }));
    const unpaidElectricityTotal = unpaidElectricityMonths.reduce((sum, item) => sum + item.amount, 0);

    // Every month with a record, oldest first: what was read, billed, paid and is still due.
    const unitPayments = payments.filter((item) => item.unitId === unit.id);
    let electricityStart = moveInDate?.slice(0, 7) ?? unitPayments.map((p) => p.month).sort()[0] ?? BUILDING_READY_MONTH;
    if (electricityStart < BUILDING_READY_MONTH) electricityStart = BUILDING_READY_MONTH;
    const cents = (n: number) => Math.round(n * 100) / 100;
    const electricityMonths =
      unit.tenantName?.trim() && electricityStart <= getCurrentMonth()
        ? buildElectricityStatement(unitPayments, rate, electricityStart, getCurrentMonth(), unit.plotNumber)
            .filter((m) => m.recorded)
            .map((m) => {
              const record = unitPayments.find((p) => p.month === m.month);
              return {
                month: m.month,
                prevReading: record?.prevReading ?? 0,
                currReading: record?.currReading ?? 0,
                units: computeElectricityUnits(record?.prevReading ?? 0, record?.currReading ?? 0),
                isDefault: !hasMeterReading(record?.currReading),
                bill: cents(m.electricityBill),
                paid: cents(m.credited),
                balance: cents(m.balance),
                status: (m.balance <= 0 ? "PAID" : m.credited > 0 ? "PARTIAL" : "UNPAID") as "PAID" | "PARTIAL" | "UNPAID",
              };
            })
        : [];
    const electricityTotals = {
      billed: cents(electricityMonths.reduce((s, m) => s + m.bill, 0)),
      paid: cents(electricityMonths.reduce((s, m) => s + m.paid, 0)),
      due: cents(electricityMonths.reduce((s, m) => s + m.balance, 0)),
    };
    return {
      electricityMonths,
      electricityTotals,
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
      electricityAmount: computeElectricityAmount(prevReading, currReading, rate, billPlot),
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
