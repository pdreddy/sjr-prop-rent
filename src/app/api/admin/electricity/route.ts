import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { isValidMonth, getCurrentMonth, isBeforeMoveInMonth } from "@/lib/month";
import { allPayments, allUnits, paymentDTO, paymentFor, savePayment, unitById } from "@/lib/store";
import { computeElectricityAmount } from "@/lib/electricity";
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

  const [units, payments] = await Promise.all([allUnits(), allPayments()]);
  const rows = units
    .filter((unit) => unit.active && (!search || [unit.plotNumber, unit.tenantName].some((v) => v?.toLowerCase().includes(search))))
    .map((unit) => {
      const payment = payments.find((p) => p.unitId === unit.id && p.month === month);
      const prevReading = payment?.prevReading ?? 0;
      const currReading = payment?.currReading ?? 0;
      return {
        unitId: unit.id,
        plotNumber: unit.plotNumber,
        tenantName: unit.tenantName,
        isBeforeMoveIn: isBeforeMoveInMonth(unit.moveInDate, month),
        prevReading,
        currReading,
        electricityAmount: computeElectricityAmount(prevReading, currReading),
        electricityPaid: payment?.electricityPaid ?? false,
      };
    });

  const response: ElectricityListResponse = { month, rows };
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

  const unit = await unitById(parsed.data.unitId);
  if (!unit) return NextResponse.json({ error: "Plot not found." }, { status: 404 });

  // Only the meter-reading fields are ever touched here — everything else about the
  // month's payment (rent, amount paid, notes, ...) is carried over unchanged so a
  // security-only login can never see or alter financial data.
  const existing = await paymentFor(parsed.data.unitId, parsed.data.month);
  const rentAmount = existing?.rentAmount ?? unit.monthlyRent;
  const maintenanceAmount = existing?.maintenanceAmount ?? unit.maintenanceAmount;
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
    electricityAmount: computeElectricityAmount(parsed.data.prevReading, parsed.data.currReading),
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
    previousValue: existing ? paymentDTO(existing) : null,
    newValue: paymentDTO(payment),
  });

  return NextResponse.json({ payment: paymentDTO(payment) });
}
