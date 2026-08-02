import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedAdmin } from "@/lib/auth";
import { createUnitSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";
import { serializeUnit } from "@/lib/serialize";

export async function GET(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("search")?.trim();

  const units = await prisma.unit.findMany({
    where: search
      ? {
          OR: [
            { plotNumber: { contains: search, mode: "insensitive" } },
            { tenantName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { plotNumber: "asc" },
  });

  return NextResponse.json({ units: units.map(serializeUnit) });
}

export async function POST(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createUnitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const existing = await prisma.unit.findUnique({
    where: { plotNumber: parsed.data.plotNumber },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A plot with this number already exists." },
      { status: 409 }
    );
  }

  const unit = await prisma.unit.create({
    data: {
      plotNumber: parsed.data.plotNumber,
      tenantName: parsed.data.tenantName || null,
      phone: parsed.data.phone || null,
      monthlyRent: parsed.data.monthlyRent,
    },
  });

  await recordAuditLog({
    adminId: admin.id,
    action: "CREATE",
    recordType: "Unit",
    recordId: unit.id,
    newValue: serializeUnit(unit),
  });

  return NextResponse.json({ unit: serializeUnit(unit) }, { status: 201 });
}
