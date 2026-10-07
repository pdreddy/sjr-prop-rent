import { NextRequest, NextResponse } from "next/server";
import { deletePayment, getElectricityRate, paymentDTO, paymentFor, savePayment, unitById } from "@/lib/store";
import { formatMonthLabel, isValidMonth } from "@/lib/month";
import { getAuthedAdmin } from "@/lib/auth";
import { upsertPaymentSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";
import { computeElectricityAmount } from "@/lib/electricity";

export async function PUT(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = upsertPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const rate = await getElectricityRate();
  const unit = await unitById(parsed.data.unitId);
  if (!unit) {
    return NextResponse.json({ error: "Plot not found." }, { status: 404 });
  }

  const paidDate = parsed.data.paidDate ? new Date(parsed.data.paidDate) : null;
  if (parsed.data.paidDate && Number.isNaN(paidDate?.getTime())) {
    return NextResponse.json({ error: "Invalid paid date." }, { status: 400 });
  }

  const existing = await paymentFor(parsed.data.unitId, parsed.data.month);

  // Moving a record to another month (it was filed under the wrong one): the target month must be free,
  // so nothing is silently overwritten; the old record is removed once the new one is saved.
  const originalMonth = parsed.data.originalMonth && parsed.data.originalMonth !== parsed.data.month ? parsed.data.originalMonth : null;
  const original = originalMonth ? await paymentFor(parsed.data.unitId, originalMonth) : null;
  if (originalMonth) {
    if (!original) return NextResponse.json({ error: `There is no record for ${formatMonthLabel(originalMonth)} to move.` }, { status: 404 });
    if (existing) return NextResponse.json({ error: `A record for ${formatMonthLabel(parsed.data.month)} already exists. Edit or delete that one first.` }, { status: 409 });
  }

  const data = {
    paymentStatus: parsed.data.paymentStatus,
    rentAmount: parsed.data.rentAmount,
    maintenanceAmount: parsed.data.maintenanceAmount,
    amountPaid: parsed.data.amountPaid,
    balanceDue: parsed.data.balanceDue,
    paidDate,
    notes: parsed.data.notes || null,
    prevReading: parsed.data.prevReading,
    currReading: parsed.data.currReading,
    electricityAmount: computeElectricityAmount(parsed.data.prevReading, parsed.data.currReading, rate, unit.plotNumber),
    electricityPaid: parsed.data.electricityPaid,
    updatedBy: admin.username,
  };

  const payment = await savePayment(parsed.data.unitId, parsed.data.month, data);
  if (originalMonth) await deletePayment(parsed.data.unitId, originalMonth);

  await recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: originalMonth ? "MOVE" : existing ? "UPDATE" : "CREATE",
    recordType: "Payment",
    recordId: payment.id,
    previousValue: original ? paymentDTO(original, rate, unit.plotNumber) : existing ? paymentDTO(existing, rate, unit.plotNumber) : null,
    newValue: paymentDTO(payment, rate, unit.plotNumber),
  });

  return NextResponse.json({ payment: paymentDTO(payment, rate, unit.plotNumber) });
}

// Deletes one month's record (e.g. entered by mistake): /api/admin/payments?unitId=...&month=YYYY-MM
export async function DELETE(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const unitId = request.nextUrl.searchParams.get("unitId");
  const month = request.nextUrl.searchParams.get("month");
  if (!unitId || !month || !isValidMonth(month)) return NextResponse.json({ error: "unitId and a valid month are required." }, { status: 400 });

  const unit = await unitById(unitId);
  if (!unit) return NextResponse.json({ error: "Plot not found." }, { status: 404 });
  const existing = await paymentFor(unitId, month);
  if (!existing) return NextResponse.json({ error: "No record for that month." }, { status: 404 });

  const rate = await getElectricityRate();
  await deletePayment(unitId, month);
  await recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "DELETE",
    recordType: "Payment",
    recordId: existing.id,
    previousValue: paymentDTO(existing, rate, unit.plotNumber),
    newValue: null,
  });
  return NextResponse.json({ deleted: true });
}
