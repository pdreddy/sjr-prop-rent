import { NextRequest, NextResponse } from "next/server";
import { paymentDTO, paymentFor, savePayment, unitById } from "@/lib/store";
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

  const unit = await unitById(parsed.data.unitId);
  if (!unit) {
    return NextResponse.json({ error: "Plot not found." }, { status: 404 });
  }

  const paidDate = parsed.data.paidDate ? new Date(parsed.data.paidDate) : null;
  if (parsed.data.paidDate && Number.isNaN(paidDate?.getTime())) {
    return NextResponse.json({ error: "Invalid paid date." }, { status: 400 });
  }

  const existing = await paymentFor(parsed.data.unitId, parsed.data.month);

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
    electricityAmount: computeElectricityAmount(parsed.data.prevReading, parsed.data.currReading),
    electricityPaid: parsed.data.electricityPaid,
    updatedBy: admin.username,
  };

  const payment = await savePayment(parsed.data.unitId, parsed.data.month, data);

  await recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: existing ? "UPDATE" : "CREATE",
    recordType: "Payment",
    recordId: payment.id,
    previousValue: existing ? paymentDTO(existing) : null,
    newValue: paymentDTO(payment),
  });

  return NextResponse.json({ payment: paymentDTO(payment) });
}
