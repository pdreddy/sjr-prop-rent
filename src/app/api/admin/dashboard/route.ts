import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { isValidMonth, getCurrentMonth, isBeforeMoveInMonth } from "@/lib/month";
import { allPayments, allUnits, paymentDTO, unitDTO } from "@/lib/store";

export async function GET(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const monthParam = params.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();
  const search = params.get("search")?.trim().toLowerCase();
  const statusFilter = params.get("status");
  const [unitRecords, paymentRecords] = await Promise.all([allUnits(), allPayments()]);
  let rows = unitRecords.filter((unit) => unit.active && (!search || [unit.plotNumber, unit.tenantName, unit.phone].some((v) => v?.toLowerCase().includes(search)))).map((unit) => {
    const payment = paymentRecords.find((p) => p.unitId === unit.id && p.month === month) ?? null;
    const isVacant = !unit.tenantName?.trim();
    const isBeforeMoveIn = isBeforeMoveInMonth(unit.moveInDate, month);
    return { unit: unitDTO(unit), payment: payment ? paymentDTO(payment) : null, isVacant, isBeforeMoveIn, effectiveStatus: payment?.paymentStatus ?? "UNPAID" };
  });
  if (statusFilter && statusFilter !== "ALL") {
    rows = rows.filter((row) => {
      if (statusFilter === "VACANT") return row.isVacant;
      return !row.isBeforeMoveIn && row.effectiveStatus === statusFilter;
    });
  }
  const totals = rows.reduce((acc, row) => {
    if (row.isBeforeMoveIn) return acc;
    const expected = row.payment ? row.payment.rentAmount + row.payment.maintenanceAmount : row.unit.monthlyRent + row.unit.maintenanceAmount;
    acc.totalExpected += expected; acc.totalCollected += row.payment?.amountPaid ?? 0;
    if (row.effectiveStatus === "PAID") acc.numPaid++; else if (row.effectiveStatus === "PARTIAL") acc.numPartial++; else acc.numUnpaid++;
    return acc;
  }, { totalExpected: 0, totalCollected: 0, numPaid: 0, numPartial: 0, numUnpaid: 0 });
  return NextResponse.json({ month, rows, totals: { ...totals, outstandingBalance: totals.totalExpected - totals.totalCollected, totalUnits: rows.length } });
}
