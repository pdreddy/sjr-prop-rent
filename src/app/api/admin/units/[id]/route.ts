import { NextRequest, NextResponse } from "next/server";
import { unitById, unitByPlot, unitDTO, updateUnit } from "@/lib/store";
import { getAuthedAdmin } from "@/lib/auth";
import { updateUnitSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await unitById(id);
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
    const conflict = await unitByPlot(parsed.data.plotNumber);
    if (conflict) {
      return NextResponse.json(
        { error: "A plot with this number already exists." },
        { status: 409 }
      );
    }
  }

  let moveInDate: Date | null | undefined;
  if (parsed.data.moveInDate !== undefined) {
    moveInDate = parsed.data.moveInDate ? new Date(parsed.data.moveInDate) : null;
    if (parsed.data.moveInDate && Number.isNaN(moveInDate?.getTime())) {
      return NextResponse.json({ error: "Invalid move-in date." }, { status: 400 });
    }
  }

  const unit = await updateUnit(id, {
      ...(parsed.data.plotNumber !== undefined && { plotNumber: parsed.data.plotNumber }),
      ...(parsed.data.tenantName !== undefined && { tenantName: parsed.data.tenantName || null }),
      ...(moveInDate !== undefined && { moveInDate }),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone || null }),
      ...(parsed.data.advanceAmount !== undefined && { advanceAmount: parsed.data.advanceAmount }),
      ...(parsed.data.monthlyRent !== undefined && { monthlyRent: parsed.data.monthlyRent }),
      ...(parsed.data.maintenanceAmount !== undefined && {
        maintenanceAmount: parsed.data.maintenanceAmount,
      }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
  });

  await recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "UPDATE",
    recordType: "Unit",
    recordId: unit.id,
    previousValue: unitDTO(existing),
    newValue: unitDTO(unit),
  });

  return NextResponse.json({ unit: unitDTO(unit) });
}
