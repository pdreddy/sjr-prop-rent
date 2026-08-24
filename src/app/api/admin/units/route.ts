import { NextRequest, NextResponse } from "next/server";
import { listUnits, getUnitByPlotNumber, createUnit } from "@/lib/db";
import { getAuthedAdmin } from "@/lib/auth";
import { createUnitSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";
import { serializeUnit } from "@/lib/serialize";
import { withErrorHandling } from "@/lib/apiHandler";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("search")?.trim().toLowerCase();

  let units = await listUnits();
  if (search) {
    units = units.filter(
      (u) =>
        u.plotNumber.toLowerCase().includes(search) ||
        (u.tenantName?.toLowerCase().includes(search) ?? false) ||
        (u.phone?.toLowerCase().includes(search) ?? false)
    );
  }
  units.sort((a, b) => a.plotNumber.localeCompare(b.plotNumber));

  return NextResponse.json({ units: units.map(serializeUnit) });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
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

  const existing = await getUnitByPlotNumber(parsed.data.plotNumber);
  if (existing) {
    return NextResponse.json(
      { error: "A plot with this number already exists." },
      { status: 409 }
    );
  }

  const moveInDate = parsed.data.moveInDate ? new Date(parsed.data.moveInDate) : null;
  if (parsed.data.moveInDate && Number.isNaN(moveInDate?.getTime())) {
    return NextResponse.json({ error: "Invalid move-in date." }, { status: 400 });
  }

  const unit = await createUnit({
    plotNumber: parsed.data.plotNumber,
    tenantName: parsed.data.tenantName || null,
    moveInDate: moveInDate ? moveInDate.getTime() : null,
    phone: parsed.data.phone || null,
    monthlyRent: parsed.data.monthlyRent,
    maintenanceAmount: parsed.data.maintenanceAmount ?? 0,
    active: true,
  });

  await recordAuditLog({
    adminId: admin.id,
    action: "CREATE",
    recordType: "Unit",
    recordId: unit.id,
    newValue: serializeUnit(unit),
  });

  return NextResponse.json({ unit: serializeUnit(unit) }, { status: 201 });
});
