import { withErrorHandling } from "@/lib/apiHandler";
import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { isValidMonth, getCurrentMonth, getPreviousMonth, isBeforeMoveInMonth, isBeforeFirstRentMonth } from "@/lib/month";
import { getBuildingBill, allPayments, allUnits, getElectricityConfig, paymentDTO, paymentFor, savePayment, unitById } from "@/lib/store";
import { expectedForMonth } from "@/lib/proration";
import { computeElectricityAmount, profileForMonth } from "@/lib/electricity";
import { buildLedgers, buildUnitMonthView } from "@/lib/monthView";
import { electricityUpsertSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";
import type { ElectricityListResponse } from "@/lib/types";

// Both roles (ADMIN and SECURITY) may read and write electricity readings — the
// security login exists specifically to enter these every month.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const monthParam = params.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();
  const search = params.get("search")?.trim().toLowerCase();
  const previousMonth = getPreviousMonth(month);

  const [units, payments, rate] = await Promise.all([allUnits(), allPayments(), getElectricityConfig()]);
  const currentMonth = getCurrentMonth();
  const ledgers = buildLedgers(units.filter((unit) => unit.active), payments, rate, month > currentMonth ? month : currentMonth);
  const rows = units
    .filter((unit) => unit.active && (!search || [unit.plotNumber, unit.tenantName].some((v) => v?.toLowerCase().includes(search))))
    .map((unit) => {
      const payment = payments.find((p) => p.unitId === unit.id && p.month === month);
      // Nothing recorded yet for this month → start from last month's current reading, so
      // only the new current reading has to be entered.
      const unrecorded = !payment || (!payment.prevReading && !payment.currReading);
      // Bill, paid and balance come from the tenant's ledger, exactly as on the Electricity bills tab.
      const { electricity } = buildUnitMonthView(unit, ledgers.get(unit.id), payment, month);
      const lastMonthPayment = payments.find((p) => p.unitId === unit.id && p.month === previousMonth);
      const prevReading = unrecorded ? lastMonthPayment?.currReading ?? 0 : payment.prevReading ?? 0;
      const currReading = unrecorded ? 0 : payment.currReading ?? 0;
      return {
        unitId: unit.id,
        plotNumber: unit.plotNumber,
        tenantName: unit.tenantName,
        isBeforeMoveIn: isBeforeMoveInMonth(unit.moveInDate, month),
        prevReading,
        currReading,
        electricityAmount: electricity.bill,
        electricityPaid: payment?.electricityPaid ?? false,
        electricityCovered: electricity.covered,
        electricityBalance: electricity.balance,
        outstandingTotal: electricity.outstandingTotal,
      };
    });

  // The building's own bill is money information: the security login never receives it.
  const building = admin.role === "ADMIN"
    ? { actualBill: await getBuildingBill(month), billedToTenants: Math.round(units.filter((u) => u.active).reduce((sum, u) => sum + buildUnitMonthView(u, ledgers.get(u.id), payments.find((p) => p.unitId === u.id && p.month === month), month).electricity.bill, 0) * 100) / 100 }
    : undefined;
  const response: ElectricityListResponse = { month, building, ratePerUnit: profileForMonth(rate, month).profile.ratePerUnit, config: rate, rows };
  return NextResponse.json(response);
});

export const PUT = withErrorHandling(async (request: NextRequest) => {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = electricityUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const rate = await getElectricityConfig();
  const unit = await unitById(parsed.data.unitId);
  if (!unit) return NextResponse.json({ error: "Plot not found." }, { status: 404 });

  // Only the meter-reading fields are ever touched here — everything else about the
  // month's payment (rent, amount paid, notes, ...) is carried over unchanged so a
  // security-only login can never see or alter financial data.
  const existing = await paymentFor(parsed.data.unitId, parsed.data.month);
  const expected = expectedForMonth(unit, parsed.data.month);
  // A reading taken in the move-in month (before rent starts) must not create rent that was never due.
  const noRentYet = isBeforeFirstRentMonth(unit.moveInDate, parsed.data.month);
  const rentAmount = existing?.rentAmount ?? (noRentYet ? 0 : expected.rent);
  const maintenanceAmount = existing?.maintenanceAmount ?? (noRentYet ? 0 : expected.maintenance);
  const amountPaid = existing?.amountPaid ?? 0;
  const balanceDue = existing?.balanceDue ?? rentAmount + maintenanceAmount;

  const data = {
    paymentStatus: existing?.paymentStatus ?? "UNPAID",
    rentAmount,
    maintenanceAmount,
    amountPaid,
    balanceDue,
    paidDate: existing?.paidDate ?? null,
    notes: existing?.notes ?? null,
    prevReading: parsed.data.prevReading,
    currReading: parsed.data.currReading,
    electricityAmount: computeElectricityAmount(parsed.data.prevReading, parsed.data.currReading, rate, unit.plotNumber, parsed.data.month),
    electricityPaid: parsed.data.electricityPaid,
    updatedBy: admin.username,
  };

  const payment = await savePayment(parsed.data.unitId, parsed.data.month, data);

  await recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: existing ? "UPDATE" : "CREATE",
    recordType: "Electricity",
    recordId: payment.id,
    previousValue: existing ? paymentDTO(existing, rate, unit.plotNumber) : null,
    newValue: paymentDTO(payment, rate, unit.plotNumber),
  });

  return NextResponse.json({ payment: paymentDTO(payment, rate, unit.plotNumber) });
});
