import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedAdmin } from "@/lib/auth";
import { copyMonthSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = copyMonthSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { sourceMonth, targetMonth } = parsed.data;
  if (sourceMonth === targetMonth) {
    return NextResponse.json(
      { error: "Source and target month must be different." },
      { status: 400 }
    );
  }

  const units = await prisma.unit.findMany({
    where: { active: true },
    include: {
      payments: { where: { month: { in: [sourceMonth, targetMonth] } } },
    },
  });

  const toCreate = units.filter((unit) => {
    const hasTarget = unit.payments.some((p) => p.month === targetMonth);
    return !hasTarget;
  });

  const created = await prisma.$transaction(
    toCreate.map((unit) => {
      const sourcePayment = unit.payments.find((p) => p.month === sourceMonth);
      const rentAmount = sourcePayment ? sourcePayment.rentAmount : unit.monthlyRent;
      const maintenanceAmount = sourcePayment
        ? sourcePayment.maintenanceAmount
        : unit.maintenanceAmount;
      const totalExpected = Number(rentAmount) + Number(maintenanceAmount);
      return prisma.payment.create({
        data: {
          unitId: unit.id,
          month: targetMonth,
          paymentStatus: "UNPAID",
          rentAmount,
          maintenanceAmount,
          amountPaid: 0,
          balanceDue: totalExpected,
          updatedBy: admin.username,
        },
      });
    })
  );

  await recordAuditLog({
    adminId: admin.id,
    action: "COPY_MONTH",
    recordType: "Payment",
    newValue: { sourceMonth, targetMonth, createdCount: created.length },
  });

  return NextResponse.json({ createdCount: created.length, skippedCount: units.length - toCreate.length });
}
