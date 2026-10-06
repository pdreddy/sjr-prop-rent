import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { isValidMonth, getCurrentMonth, isBeforeMoveInMonth } from "@/lib/month";
import { expectedForMonth } from "@/lib/proration";
import { allPayments, allUnits, getElectricityRate, paymentDTO, unitDTO } from "@/lib/store";

export async function GET(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const monthParam = params.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();
  const search = params.get("search")?.trim().toLowerCase();
  const statusFilter = params.get("status");
  const [unitRecords, paymentRecords, rate] = await Promise.all([allUnits(), allPayments(), getElectricityRate()]);
  let rows = unitRecords
    .filter(
      (unit) =>
        unit.active &&
        (!search || [unit.plotNumber, unit.tenantName, ...(unit.phoneNumbers ?? [])].some((v) => v?.toLowerCase().includes(search)))
    )
    .map((unit) => {
    const payment = paymentRecords.find((p) => p.unitId === unit.id && p.month === month) ?? null;
    const isVacant = !unit.tenantName?.trim();
    const isBeforeMoveIn = isBeforeMoveInMonth(unit.moveInDate, month);
    const expected = expectedForMonth({ monthlyRent: unit.monthlyRent, maintenanceAmount: unit.maintenanceAmount, moveInDate: unit.moveInDate }, month);
    return {
      unit: unitDTO(unit), payment: payment ? paymentDTO(payment, rate) : null, isVacant, isBeforeMoveIn, effectiveStatus: payment?.paymentStatus ?? "UNPAID",
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
    if (row.isBeforeMoveIn) return acc;
    const expected = row.payment ? row.payment.rentAmount + row.payment.maintenanceAmount : row.expectedRent + row.expectedMaintenance;
    acc.totalExpected += expected; acc.totalCollected += row.payment?.amountPaid ?? 0;
    if (row.effectiveStatus === "PAID") acc.numPaid++; else if (row.effectiveStatus === "PARTIAL") acc.numPartial++; else acc.numUnpaid++;
    return acc;
  }, { totalExpected: 0, totalCollected: 0, numPaid: 0, numPartial: 0, numUnpaid: 0 });
  return NextResponse.json({ month, electricityRatePerUnit: rate, rows, totals: { ...totals, outstandingBalance: totals.totalExpected - totals.totalCollected, totalUnits: rows.length } });
}
