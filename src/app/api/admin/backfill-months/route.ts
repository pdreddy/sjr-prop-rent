import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { backfillMonths } from "@/lib/backfillMonths";
import { recordAuditLog } from "@/lib/audit";

// Fills in months that have no payment record between each tenant's first rent month (the month
// after move-in) and now, and corrects an unpaid first record that was saved at the full
// (un-prorated) rent. Nothing that already has a payment against it is changed.
// POST { dryRun: true } only counts.
export async function POST(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const dryRun = body?.dryRun === true;
  const { created, adjusted, needsReview } = await backfillMonths({ dryRun, updatedBy: admin.username });

  if (!dryRun && (created > 0 || adjusted > 0)) {
    await recordAuditLog({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "BACKFILL_MONTHS",
      recordType: "Payment",
      newValue: { created, adjusted, needsReview },
    });
  }
  return NextResponse.json({ dryRun, created, adjusted, needsReview });
}
