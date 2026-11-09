import { withErrorHandling } from "@/lib/apiHandler";
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { dataSourceInfo } from "@/lib/firebase";
import { getCurrentMonth, getPreviousMonth } from "@/lib/month";
import { allPayments, allUnits } from "@/lib/store";

export const dynamic = "force-dynamic";

// Which database this deployment reads, and how much it holds. ADMIN only. Answers "why does this
// site show different data from my computer": the two are usually pointed at different copies.
export const GET = withErrorHandling(async () => {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const [units, payments] = await Promise.all([allUnits(), allPayments()]);
  const month = getCurrentMonth();
  const previous = getPreviousMonth(month);
  const months = payments.map((p) => p.month).sort();
  return NextResponse.json({
    ...dataSourceInfo(),
    serverMonth: month,
    plots: units.filter((u) => u.active).length,
    records: payments.length,
    recordsThisMonth: payments.filter((p) => p.month === month).length,
    recordsLastMonth: payments.filter((p) => p.month === previous).length,
    latestRecordMonth: months.at(-1) ?? null,
    build: { branch: process.env.NEXT_PUBLIC_BUILD_BRANCH || null, commit: process.env.NEXT_PUBLIC_BUILD_COMMIT || null },
  });
});
