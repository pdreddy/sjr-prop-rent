import { NextRequest, NextResponse } from "next/server";
import { getUnitById, getPayment, upsertPayment } from "@/lib/db";
import { getAuthedAdmin } from "@/lib/auth";
import { upsertPaymentSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";
import { serializePayment } from "@/lib/serialize";
import { withErrorHandling } from "@/lib/apiHandler";

export const PUT = withErrorHandling(async (request: NextRequest) => {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = upsertPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const unit = await getUnitById(parsed.data.unitId);
  if (!unit) {
    return NextResponse.json({ error: "Plot not found." }, { status: 404 });
  }

  const paidDate = parsed.data.paidDate ? new Date(parsed.data.paidDate) : null;
  if (parsed.data.paidDate && Number.isNaN(paidDate?.getTime())) {
    return NextResponse.json({ error: "Invalid paid date." }, { status: 400 });
  }

  const existing = await getPayment(parsed.data.unitId, parsed.data.month);

  const { payment } = await upsertPayment(parsed.data.unitId, parsed.data.month, {
    paymentStatus: parsed.data.paymentStatus,
    rentAmount: parsed.data.rentAmount,
    maintenanceAmount: parsed.data.maintenanceAmount,
    amountPaid: parsed.data.amountPaid,
    balanceDue: parsed.data.balanceDue,
    paidDate: paidDate ? paidDate.getTime() : null,
    notes: parsed.data.notes || null,
    updatedBy: admin.username,
  });

  await recordAuditLog({
    adminId: admin.id,
    action: existing ? "UPDATE" : "CREATE",
    recordType: "Payment",
    recordId: payment.id,
    previousValue: existing ? serializePayment(existing) : null,
    newValue: serializePayment(payment),
  });

  return NextResponse.json({ payment: serializePayment(payment) });
});
