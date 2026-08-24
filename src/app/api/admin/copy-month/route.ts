import { NextRequest, NextResponse } from "next/server";
import { listUnits, getPaymentsForUnits, createPaymentIfAbsent } from "@/lib/db";
import { getAuthedAdmin } from "@/lib/auth";
import { copyMonthSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";
import { withErrorHandling } from "@/lib/apiHandler";

export const POST = withErrorHandling(async (request: NextRequest) => {
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

  const units = (await listUnits()).filter((u) => u.active);
  const unitIds = units.map((u) => u.id);
  const [sourcePayments, targetPayments] = await Promise.all([
    getPaymentsForUnits(unitIds, sourceMonth),
    getPaymentsForUnits(unitIds, targetMonth),
  ]);

  const toCreate = units.filter((unit) => !targetPayments.has(unit.id));

  const results = await Promise.all(
    toCreate.map((unit) => {
      const sourcePayment = sourcePayments.get(unit.id);
      const rentAmount = sourcePayment ? sourcePayment.rentAmount : unit.monthlyRent;
      const maintenanceAmount = sourcePayment
        ? sourcePayment.maintenanceAmount
        : unit.maintenanceAmount;
      const totalExpected = rentAmount + maintenanceAmount;
      return createPaymentIfAbsent(unit.id, targetMonth, {
        paymentStatus: "UNPAID",
        rentAmount,
        maintenanceAmount,
        amountPaid: 0,
        balanceDue: totalExpected,
        paidDate: null,
        notes: null,
        updatedBy: admin.username,
      });
    })
  );
  const createdCount = results.filter(Boolean).length;

  await recordAuditLog({
    adminId: admin.id,
    action: "COPY_MONTH",
    recordType: "Payment",
    newValue: { sourceMonth, targetMonth, createdCount },
  });

  return NextResponse.json({
    createdCount,
    skippedCount: units.length - createdCount,
  });
});
