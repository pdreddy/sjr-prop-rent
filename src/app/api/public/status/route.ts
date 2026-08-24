import { NextRequest, NextResponse } from "next/server";
import { listUnits, getPaymentsForUnits } from "@/lib/db";
import { BUILDING_NAME } from "@/lib/constants";
import { isValidMonth, getCurrentMonth } from "@/lib/month";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const monthParam = request.nextUrl.searchParams.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();

  const allUnits = await listUnits();
  const units = allUnits
    .filter((u) => u.active)
    .sort((a, b) => a.plotNumber.localeCompare(b.plotNumber));

  const payments = await getPaymentsForUnits(
    units.map((u) => u.id),
    month
  );

  const plots = units.map((unit) => ({
    plotNumber: unit.plotNumber,
    tenantName: unit.tenantName,
    moveInDate: unit.moveInDate === null ? null : new Date(unit.moveInDate).toISOString(),
    // Public view collapses PARTIAL into "unpaid so far" — only PAID counts as paid.
    status: payments.get(unit.id)?.paymentStatus === "PAID" ? "PAID" : "UNPAID",
  }));

  const paidCount = plots.filter((p) => p.status === "PAID").length;

  return NextResponse.json({
    buildingName: BUILDING_NAME,
    month,
    totalPlots: plots.length,
    paidCount,
    plots,
  });
});
