import { NextRequest, NextResponse } from "next/server";
import { listAuditLogs } from "@/lib/db";
import { getAuthedAdmin } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiHandler";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200);

  const logs = await listAuditLogs(limit);

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      adminUsername: log.adminUsername ?? "unknown",
      action: log.action,
      recordType: log.recordType,
      recordId: log.recordId,
      createdAt: new Date(log.createdAt).toISOString(),
    })),
  });
});
