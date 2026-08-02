import { NextRequest, NextResponse } from "next/server";
import { allPayments, allUnits } from "@/lib/store";
import { BUILDING_NAME } from "@/lib/constants";
import { isValidMonth, getCurrentMonth } from "@/lib/month";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const monthParam = request.nextUrl.searchParams.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();

  const [allUnitRecords, payments] = await Promise.all([allUnits(), allPayments()]);
  const units = allUnitRecords.filter((unit) => unit.active);

  const plots = units.map((unit) => ({
    plotNumber: unit.plotNumber,
    tenantName: unit.tenantName,
    moveInDate: unit.moveInDate?.toISOString() ?? null,
    // Public view collapses PARTIAL into "unpaid so far" — only PAID counts as paid.
    status: payments.find((p) => p.unitId === unit.id && p.month === month)?.paymentStatus === "PAID" ? "PAID" : "UNPAID",
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
