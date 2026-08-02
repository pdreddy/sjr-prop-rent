import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BUILDING_NAME } from "@/lib/constants";
import { isValidMonth, getCurrentMonth } from "@/lib/month";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const monthParam = request.nextUrl.searchParams.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();

  const units = await prisma.unit.findMany({
    where: { active: true },
    orderBy: { plotNumber: "asc" },
    select: {
      id: true,
      plotNumber: true,
      tenantName: true,
      moveInDate: true,
      payments: {
        where: { month },
        select: { paymentStatus: true },
      },
    },
  });

  const plots = units.map((unit) => ({
    plotNumber: unit.plotNumber,
    tenantName: unit.tenantName,
    moveInDate: unit.moveInDate,
    // Public view collapses PARTIAL into "unpaid so far" — only PAID counts as paid.
    status: unit.payments[0]?.paymentStatus === "PAID" ? "PAID" : "UNPAID",
  }));

  const paidCount = plots.filter((p) => p.status === "PAID").length;

  return NextResponse.json({
    buildingName: BUILDING_NAME,
    month,
    totalPlots: plots.length,
    paidCount,
    plots,
  });
}
