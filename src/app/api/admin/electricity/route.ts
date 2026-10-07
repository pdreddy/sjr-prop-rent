import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { isValidMonth, getCurrentMonth, getPreviousMonth, isBeforeMoveInMonth } from "@/lib/month";
import { allPayments, allUnits, getElectricityRate, paymentDTO, paymentFor, savePayment, unitById } from "@/lib/store";
import { expectedForMonth } from "@/lib/proration";
import { computeElectricityAmount } from "@/lib/electricity";
import { withElectricityThreshold } from "@/lib/proration";
import { buildElectricityLedger } from "@/lib/electricityLedger";
import { electricityUpsertSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";
import type { ElectricityListResponse } from "@/lib/types";

// Both roles (ADMIN and SECURITY) may read and write electricity readings — the
// security login exists specifically to enter these every month.
export async function GET(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const monthParam = params.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();
  const search = params.get("search")?.trim().toLowerCase();
  const previousMonth = getPreviousMonth(month);

  const [units, payments, rate] = await Promise.all([allUnits(), allPayments(), getElectricityRate()]);
  const rows = units
    .filter((unit) => unit.active && (!search || [unit.plotNumber, unit.tenantName].some((v) => v?.toLowerCase().includes(search))))
    .map((unit) => {
      const payment = payments.find((p) => p.unitId === unit.id && p.month === month);
      // Nothing recorded yet for this month → start from last month's current reading, so
      // only the new current reading has to be entered.
      const unrecorded = !payment || (!payment.prevReading && !payment.currReading);
      const ledger = buildElectricityLedger(
        withElectricityThreshold(unit, payments.filter((p) => p.unitId === unit.id && !isBeforeMoveInMonth(unit.moveInDate, p.month))),
        rate,
        unit.plotNumber
      );
      const entry = ledger.find((e) => e.month === month);
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
        electricityAmount: computeElectricityAmount(prevReading, currReading, rate, unit.plotNumber),
        electricityPaid: payment?.electricityPaid ?? false,
        electricityCovered: entry?.paid ?? 0,
        electricityBalance: entry?.balance ?? 0,
        outstandingTotal: ledger.reduce((sum, e) => sum + e.balance, 0),
      };
    });

  const response: ElectricityListResponse = { month, ratePerUnit: rate, rows };
  return NextResponse.json(response);
}

export async function PUT(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = electricityUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const rate = await getElectricityRate();
  const unit = await unitById(parsed.data.unitId);
  if (!unit) return NextResponse.json({ error: "Plot not found." }, { status: 404 });

  // Only the meter-reading fields are ever touched here — everything else about the
  // month's payment (rent, amount paid, notes, ...) is carried over unchanged so a
  // security-only login can never see or alter financial data.
  const existing = await paymentFor(parsed.data.unitId, parsed.data.month);
  const expected = expectedForMonth(unit, parsed.data.month);
  const rentAmount = existing?.rentAmount ?? expected.rent;
  const maintenanceAmount = existing?.maintenanceAmount ?? expected.maintenance;
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
    electricityAmount: computeElectricityAmount(parsed.data.prevReading, parsed.data.currReading, rate, unit.plotNumber),
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
}
