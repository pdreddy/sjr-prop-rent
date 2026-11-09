import { withErrorHandling } from "@/lib/apiHandler";
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { profileForMonth } from "@/lib/electricity";
import { allPayments, allUnits, getElectricityConfig } from "@/lib/store";
import { getCurrentMonth } from "@/lib/month";
import { buildPaymentHistory } from "@/lib/paymentHistory";
import type { PaymentHistoryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const [units, payments, rate] = await Promise.all([allUnits(), allPayments(), getElectricityConfig()]);
  const currentMonth = getCurrentMonth();
  const tenants = units
    .filter((unit) => unit.active && unit.tenantName?.trim())
    .map((unit) => buildPaymentHistory(unit, payments, rate, currentMonth));
  const response: PaymentHistoryResponse = { currentMonth, ratePerUnit: profileForMonth(rate, currentMonth).profile.ratePerUnit, config: rate, tenants };
  return NextResponse.json(response);
});
