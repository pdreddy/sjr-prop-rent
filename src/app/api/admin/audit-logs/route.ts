import { NextRequest, NextResponse } from "next/server";
import { auditLogs } from "@/lib/store";
import { getAuthedAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200);

  const logs = await auditLogs(limit);

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      adminUsername: log.adminUsername,
      action: log.action,
      recordType: log.recordType,
      recordId: log.recordId,
      createdAt: log.createdAt,
    })),
  });
}
