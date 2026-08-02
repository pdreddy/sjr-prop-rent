import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedAdmin } from "@/lib/auth";
import { upsertPaymentSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";
import { serializePayment } from "@/lib/serialize";

export async function PUT(request: NextRequest) {
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

  const unit = await prisma.unit.findUnique({ where: { id: parsed.data.unitId } });
  if (!unit) {
    return NextResponse.json({ error: "Plot not found." }, { status: 404 });
  }

  const paidDate = parsed.data.paidDate ? new Date(parsed.data.paidDate) : null;
  if (parsed.data.paidDate && Number.isNaN(paidDate?.getTime())) {
    return NextResponse.json({ error: "Invalid paid date." }, { status: 400 });
  }

  const existing = await prisma.payment.findUnique({
    where: { unitId_month: { unitId: parsed.data.unitId, month: parsed.data.month } },
  });

  const data = {
    paymentStatus: parsed.data.paymentStatus,
    rentAmount: parsed.data.rentAmount,
    amountPaid: parsed.data.amountPaid,
    balanceDue: parsed.data.balanceDue,
    paidDate,
    notes: parsed.data.notes || null,
    updatedBy: admin.username,
  };

  const payment = await prisma.payment.upsert({
    where: { unitId_month: { unitId: parsed.data.unitId, month: parsed.data.month } },
    create: {
      unitId: parsed.data.unitId,
      month: parsed.data.month,
      ...data,
    },
    update: data,
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
}
