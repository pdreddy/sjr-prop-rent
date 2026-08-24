import { NextRequest, NextResponse } from "next/server";
import { listUnits, getPaymentsForUnits } from "@/lib/db";
import { getAuthedAdmin } from "@/lib/auth";
import { isValidMonth, getCurrentMonth } from "@/lib/month";
import { serializeUnit, serializePayment } from "@/lib/serialize";
import { withErrorHandling } from "@/lib/apiHandler";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const monthParam = params.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();
  const search = params.get("search")?.trim().toLowerCase();
  const statusFilter = params.get("status"); // PAID | UNPAID | PARTIAL | VACANT | ALL

  let units = (await listUnits()).filter((u) => u.active);
  if (search) {
    units = units.filter(
      (u) =>
        u.plotNumber.toLowerCase().includes(search) ||
        (u.tenantName?.toLowerCase().includes(search) ?? false) ||
        (u.phone?.toLowerCase().includes(search) ?? false)
    );
  }
  units.sort((a, b) => a.plotNumber.localeCompare(b.plotNumber));

  const payments = await getPaymentsForUnits(
    units.map((u) => u.id),
    month
  );

  let rows = units.map((unit) => {
    const payment = payments.get(unit.id) ?? null;
    const isVacant = !unit.tenantName || unit.tenantName.trim().length === 0;
    return {
      unit: serializeUnit(unit),
      payment: payment ? serializePayment(payment) : null,
      isVacant,
      effectiveStatus: payment?.paymentStatus ?? "UNPAID",
    };
  });

  if (statusFilter && statusFilter !== "ALL") {
    if (statusFilter === "VACANT") {
      rows = rows.filter((r) => r.isVacant);
    } else {
      rows = rows.filter((r) => r.effectiveStatus === statusFilter);
    }
  }

  const totals = rows.reduce(
    (acc, r) => {
      const expected = r.payment
        ? r.payment.rentAmount + r.payment.maintenanceAmount
        : Number(r.unit.monthlyRent) + Number(r.unit.maintenanceAmount);
      const collected = r.payment ? r.payment.amountPaid : 0;
      acc.totalExpected += expected;
      acc.totalCollected += collected;
      if (r.effectiveStatus === "PAID") acc.numPaid += 1;
      else if (r.effectiveStatus === "PARTIAL") acc.numPartial += 1;
      else acc.numUnpaid += 1;
      return acc;
    },
    { totalExpected: 0, totalCollected: 0, numPaid: 0, numPartial: 0, numUnpaid: 0 }
  );

  return NextResponse.json({
    month,
    rows,
    totals: {
      ...totals,
      outstandingBalance: totals.totalExpected - totals.totalCollected,
      totalUnits: rows.length,
    },
  });
});
