import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { copyMonthSchema } from "@/lib/validation";
import { allPayments, allUnits, savePayment } from "@/lib/store";
import { recordAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const parsed = copyMonthSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  const { sourceMonth, targetMonth } = parsed.data;
  if (sourceMonth === targetMonth) return NextResponse.json({ error: "Source and target month must be different." }, { status: 400 });
  const [units, payments] = await Promise.all([allUnits(), allPayments()]);
  const active = units.filter((unit) => unit.active);
  let createdCount = 0;
  for (const unit of active) {
    if (payments.some((p) => p.unitId === unit.id && p.month === targetMonth)) continue;
    const source = payments.find((p) => p.unitId === unit.id && p.month === sourceMonth);
    const rentAmount = source?.rentAmount ?? unit.monthlyRent;
    const maintenanceAmount = source?.maintenanceAmount ?? unit.maintenanceAmount;
    // Carry the previous month's current reading forward as this month's starting
    // (previous) reading; the new current reading and bill are left for the admin to fill in.
    const electricityPreviousReading = source?.electricityCurrentReading ?? 0;
    await savePayment(unit.id, targetMonth, { paymentStatus: "UNPAID", rentAmount, maintenanceAmount, amountPaid: 0, balanceDue: rentAmount + maintenanceAmount, paidDate: null, notes: null, electricityPreviousReading, electricityCurrentReading: electricityPreviousReading, electricityAmount: 0, electricityPaid: false, updatedBy: admin.username });
    createdCount++;
  }
  await recordAuditLog({ adminId: admin.id, adminUsername: admin.username, action: "COPY_MONTH", recordType: "Payment", newValue: { sourceMonth, targetMonth, createdCount } });
  return NextResponse.json({ createdCount, skippedCount: active.length - createdCount });
}
