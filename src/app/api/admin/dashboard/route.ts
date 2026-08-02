import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedAdmin } from "@/lib/auth";
import { isValidMonth, getCurrentMonth } from "@/lib/month";
import { serializeUnit, serializePayment } from "@/lib/serialize";

export async function GET(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const monthParam = params.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();
  const search = params.get("search")?.trim();
  const statusFilter = params.get("status"); // PAID | UNPAID | PARTIAL | VACANT | ALL

  const units = await prisma.unit.findMany({
    where: {
      active: true,
      ...(search
        ? {
            OR: [
              { plotNumber: { contains: search, mode: "insensitive" } },
              { tenantName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { plotNumber: "asc" },
    include: {
      payments: { where: { month } },
    },
  });

  let rows = units.map((unit) => {
    const { payments, ...unitFields } = unit;
    const payment = payments[0] ?? null;
    const isVacant = !unit.tenantName || unit.tenantName.trim().length === 0;
    return {
      unit: serializeUnit(unitFields),
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
      const expected = r.payment ? r.payment.rentAmount : Number(r.unit.monthlyRent);
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
}
