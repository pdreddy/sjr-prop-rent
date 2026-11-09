import { withErrorHandling } from "@/lib/apiHandler";
import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { isValidMonth, getCurrentMonth, isBeforeFirstRentMonth } from "@/lib/month";
import { expectedForMonth } from "@/lib/proration";
import { profileForMonth } from "@/lib/electricity";
import { allPayments, allUnits, getElectricityConfig, paymentDTO, unitDTO } from "@/lib/store";
import { buildLedgers, buildUnitMonthView } from "@/lib/monthView";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const monthParam = params.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();
  const search = params.get("search")?.trim().toLowerCase();
  const statusFilter = params.get("status");
  const [unitRecords, paymentRecords, rate] = await Promise.all([allUnits(), allPayments(), getElectricityConfig()]);
  const currentMonth = getCurrentMonth();
  const ledgers = buildLedgers(unitRecords.filter((unit) => unit.active), paymentRecords, rate, month > currentMonth ? month : currentMonth);
  let rows = unitRecords
    .filter(
      (unit) =>
        unit.active &&
        (!search || [unit.plotNumber, unit.tenantName, ...(unit.phoneNumbers ?? [])].some((v) => v?.toLowerCase().includes(search)))
    )
    .map((unit) => {
    const payment = paymentRecords.find((p) => p.unitId === unit.id && p.month === month) ?? null;
    const isVacant = !unit.tenantName?.trim();
    const isBeforeMoveIn = isBeforeFirstRentMonth(unit.moveInDate, month);
    const expected = expectedForMonth({ monthlyRent: unit.monthlyRent, maintenanceAmount: unit.maintenanceAmount, moveInDate: unit.moveInDate }, month);
    const view = buildUnitMonthView(unit, ledgers.get(unit.id), payment, month);
    return {
      unit: unitDTO(unit), payment: payment ? paymentDTO(payment, rate, isVacant ? undefined : unit.plotNumber) : null, isVacant, isBeforeMoveIn, view,
      // Rent status from the ledger, so a month covered by rent paid ahead counts as paid here too.
      effectiveStatus: view.rent.status === "NA" ? payment?.paymentStatus ?? ("UNPAID" as const) : view.rent.status,
      expectedRent: expected.rent, expectedMaintenance: expected.maintenance, proratedDays: expected.proration.prorated ? expected.proration.days : null,
    };
  });
  if (statusFilter && statusFilter !== "ALL") {
    rows = rows.filter((row) => {
      if (statusFilter === "VACANT") return row.isVacant;
      return !row.isBeforeMoveIn && row.effectiveStatus === statusFilter;
    });
  }
  const totals = rows.reduce((acc, row) => {
    // Vacant plots and tenants who have not started yet are not part of the month's progress.
    if (row.isBeforeMoveIn || row.isVacant) return acc;
    acc.applicable++;
    acc.totalExpected += row.view.rent.due; acc.totalCollected += row.view.rent.received; acc.outstandingBalance += row.view.rent.balance;
    if (row.effectiveStatus === "PAID") acc.numPaid++; else if (row.effectiveStatus === "PARTIAL") acc.numPartial++; else acc.numUnpaid++;
    return acc;
  }, { totalExpected: 0, totalCollected: 0, numPaid: 0, numPartial: 0, numUnpaid: 0, applicable: 0, outstandingBalance: 0 });
  return NextResponse.json({ month, electricityRatePerUnit: profileForMonth(rate, month).profile.ratePerUnit, electricityConfig: rate, rows, totals: { ...totals, totalUnits: totals.applicable } });
});
