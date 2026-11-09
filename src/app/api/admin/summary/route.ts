import { withErrorHandling } from "@/lib/apiHandler";
import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { getCurrentMonth, isValidMonth } from "@/lib/month";
import { buildSummary } from "@/lib/summary";
import { allPayments, allUnits, getElectricityConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

// Month-level rollup for the admin Summary tab. ADMIN only (it carries rent money).
export const GET = withErrorHandling(async (request: NextRequest) => {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const monthParam = request.nextUrl.searchParams.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();
  const [units, payments, config] = await Promise.all([allUnits(), allPayments(), getElectricityConfig()]);
  return NextResponse.json(buildSummary(units, payments, config, month));
});
