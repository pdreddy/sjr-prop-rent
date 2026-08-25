import { NextRequest, NextResponse } from "next/server";
import { allUnits, createUnit, unitByPlot, unitDTO } from "@/lib/store";
import { getAuthedAdmin } from "@/lib/auth";
import { createUnitSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("search")?.trim();

  let units = await allUnits();
  if (search) {
    const needle = search.toLowerCase();
    units = units.filter((unit) => [unit.plotNumber, unit.tenantName, ...(unit.phones ?? [])].some((value) => value?.toLowerCase().includes(needle)));
  }

  return NextResponse.json({ units: units.map(unitDTO) });
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

  const existing = await unitByPlot(parsed.data.plotNumber);
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
      moveInDate,
      phones: parsed.data.phones ?? [],
      advanceAmount: parsed.data.advanceAmount ?? 0,
      monthlyRent: parsed.data.monthlyRent,
      maintenanceAmount: parsed.data.maintenanceAmount ?? 0,
      active: true,
  });

  await recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "CREATE",
    recordType: "Unit",
    recordId: unit.id,
    newValue: unitDTO(unit),
  });

  return NextResponse.json({ unit: unitDTO(unit) }, { status: 201 });
}
