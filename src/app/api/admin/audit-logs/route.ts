import { withErrorHandling } from "@/lib/apiHandler";
import { NextRequest, NextResponse } from "next/server";
import { allUnits, auditLogs } from "@/lib/store";
import { getAuthedAdmin } from "@/lib/auth";
import { auditGroupOf, diffAudit, parsePaymentRecordId } from "@/lib/auditView";
import type { ActivityLogResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// Everything entered or changed in the admin pages, newest first, with a readable before/after list for
// each entry. ADMIN only. `limit` (default 100, max 500) pages through history by asking for more.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "100");
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? Math.floor(limitParam) : 100, 1), 500);

  const [logs, units] = await Promise.all([auditLogs(limit + 1), allUnits()]);
  const unitById = new Map(units.map((u) => [u.id, u]));

  const entries = logs.slice(0, limit).map((log) => {
    // Payment-style records are keyed "<unitId>_<month>"; unit records by the unit id itself.
    const payment = parsePaymentRecordId(log.recordId);
    const unit = unitById.get(payment?.unitId ?? log.recordId ?? "");
    const snapshot = (log.newValue ?? log.previousValue) as { plotNumber?: string; tenantName?: string | null } | null;
    return {
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      adminUsername: log.adminUsername,
      action: log.action,
      recordType: log.recordType,
      group: auditGroupOf(log.recordType),
      recordId: log.recordId,
      plotNumber: unit?.plotNumber ?? snapshot?.plotNumber ?? null,
      tenantName: unit?.tenantName ?? snapshot?.tenantName ?? null,
      month: payment?.month ?? null,
      changes: diffAudit(log.previousValue, log.newValue),
    };
  });

  const response: ActivityLogResponse = { entries, hasMore: logs.length > limit };
  return NextResponse.json(response);
});
