import { withErrorHandling } from "@/lib/apiHandler";
import { NextRequest, NextResponse } from "next/server";
import {
  allPayments,
  allUnits,
  getElectricityConfig,
  getGeneralSettings,
  allBuildingBills,
} from "@/lib/store";
import { isValidMonth, getCurrentMonth, getPreviousMonth } from "@/lib/month";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { describeFormula, profileForMonth } from "@/lib/electricity";
import { publicRentMonths, publicRentStatus } from "@/lib/publicRentHistory";
import { publicTenantName } from "@/lib/config";
import { buildLedgers, buildUnitMonthView } from "@/lib/monthView";
import type { PublicElectricityMonth, PublicPlot } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const monthParam = request.nextUrl.searchParams.get("month");
  const month =
    monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();

  const [allUnitRecords, payments, rate, general, buildingBills] = await Promise.all([
    allUnits(),
    allPayments(),
    getElectricityConfig(),
    getGeneralSettings(),
    allBuildingBills(),
  ]);
  const units = allUnitRecords.filter((unit) => unit.active);

  // One ledger per tenant feeds everything below - the selected month's status and the full history -
  // so the row, the expanded history and the admin tabs can never disagree.
  const currentMonth = getCurrentMonth();
  const ledgers = buildLedgers(units, payments, rate, month > currentMonth ? month : currentMonth);

  const plots: PublicPlot[] = units.map((unit) => {
    const payment = payments.find(
      (item) => item.unitId === unit.id && item.month === month,
    );
    const ledger = ledgers.get(unit.id);
    const view = buildUnitMonthView(unit, ledger, payment, month);

    // Every month with a record, oldest first: what was read, billed, paid and is still due.
    const electricityMonths: PublicElectricityMonth[] = (ledger?.months ?? [])
      .filter((m) => m.recorded && !m.unapplied)
      .map((m) => ({
        month: m.month,
        prevReading: m.prevReading,
        currReading: m.currReading,
        units: m.electricityUnits,
        isDefault: m.electricityDefault,
        bill: m.electricityBill,
        paid: m.electricityCovered,
        balance: m.electricityBalance,
        status: m.electricityStatus === "NONE" ? "NA" : m.electricityStatus,
      }));
    const unpaidElectricityMonths = electricityMonths
      .filter((m) => m.balance > 0)
      .map((m) => ({ month: m.month, bill: m.bill, paid: m.paid, amount: m.balance }));
    const cents = (n: number) => Math.round(n * 100) / 100;
    const electricityTotals = {
      billed: cents(electricityMonths.reduce((s, m) => s + m.bill, 0)),
      paid: cents(electricityMonths.reduce((s, m) => s + m.paid, 0)),
      due: cents(electricityMonths.reduce((s, m) => s + m.balance, 0)),
    };
    return {
      rentMonths: ledger ? publicRentMonths(ledger) : [],
      electricityMonths,
      electricityTotals,
      unpaidElectricityTotal: electricityTotals.due,
      unpaidElectricityMonths,
      plotNumber: unit.plotNumber,
      tenantName: publicTenantName(unit.tenantName, general),
      moveInDate: unit.moveInDate?.toISOString() ?? null,
      // Vacant plots and tenants who have not started yet are N/A, so they are left out of the month's totals.
      status: publicRentStatus(view.rent.status, month),
      // N/A until the month has an electricity bill; otherwise the same status as its row in the history.
      electricityStatus: view.electricity.status,
      electricityAmount: view.electricity.bill,
      electricityCovered: view.electricity.covered,
      electricityBalance: view.electricity.balance,
      prevReading: payment?.prevReading ?? 0,
      currReading: payment?.currReading ?? 0,
    };
  });

  // Total billed to tenants in a month, from the same ledgers as the rows above.
  const billedToTenants = (m: string) =>
    Math.round(
      units.reduce(
        (sum, unit) =>
          sum +
          buildUnitMonthView(
            unit,
            ledgers.get(unit.id),
            payments.find((p) => p.unitId === unit.id && p.month === m),
            m,
          ).electricity.bill,
        0,
      ) * 100,
    ) / 100;
  // The three months before the one being viewed (never earlier than the building's first month).
  const previousMonths: string[] = [];
  for (let m = getPreviousMonth(month); previousMonths.length < 3 && m >= BUILDING_READY_MONTH; m = getPreviousMonth(m))
    previousMonths.push(m);

  const paidCount = plots.filter((p) => p.status === "PAID").length;

  return NextResponse.json({
    buildingName: general.buildingName,
    notice: general.notice,
    ratePerUnit: profileForMonth(rate, month).profile.ratePerUnit,
    formula: describeFormula(rate, month),
    month,
    // Plots in the list (including N/A ones); the progress totals only count plots that apply that month.
    totalPlots: plots.length,
    paidCount,
    // The building's own power bill next to the total billed to tenants, so residents can see the difference.
    buildingElectricity: {
      actualBill: buildingBills.get(month) ?? null,
      billedToTenants: billedToTenants(month),
      previous: previousMonths.map((m) => ({
        month: m,
        actualBill: buildingBills.get(m) ?? null,
        billedToTenants: billedToTenants(m),
      })),
    },
    plots,
  });
});
