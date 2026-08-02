import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200);

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { admin: { select: { username: true } } },
  });

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      adminUsername: log.admin?.username ?? "unknown",
      action: log.action,
      recordType: log.recordType,
      recordId: log.recordId,
      createdAt: log.createdAt,
    })),
  });
}
