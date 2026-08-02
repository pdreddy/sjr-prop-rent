import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedAdmin } from "@/lib/auth";
import { updateUnitSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";
import { serializeUnit } from "@/lib/serialize";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.unit.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Plot not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateUnitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  if (parsed.data.plotNumber && parsed.data.plotNumber !== existing.plotNumber) {
    const conflict = await prisma.unit.findUnique({
      where: { plotNumber: parsed.data.plotNumber },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "A plot with this number already exists." },
        { status: 409 }
      );
    }
  }

  const unit = await prisma.unit.update({
    where: { id },
    data: {
      ...(parsed.data.plotNumber !== undefined && { plotNumber: parsed.data.plotNumber }),
      ...(parsed.data.tenantName !== undefined && { tenantName: parsed.data.tenantName || null }),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone || null }),
      ...(parsed.data.monthlyRent !== undefined && { monthlyRent: parsed.data.monthlyRent }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
    },
  });

  await recordAuditLog({
    adminId: admin.id,
    action: "UPDATE",
    recordType: "Unit",
    recordId: unit.id,
    previousValue: serializeUnit(existing),
    newValue: serializeUnit(unit),
  });

  return NextResponse.json({ unit: serializeUnit(unit) });
}
