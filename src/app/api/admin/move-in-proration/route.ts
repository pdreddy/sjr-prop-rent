import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { allUnits, unitById, updateUnit } from "@/lib/store";
import { recordAuditLog } from "@/lib/audit";
import { moveInPaymentSchema } from "@/lib/validation";
import type { MoveInProrationResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const dayOf = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

export async function GET() {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const units = await allUnits();
  const response: MoveInProrationResponse = {
    tenants: units
      .filter((unit) => unit.active && unit.tenantName?.trim())
      .map((unit) => {
        const moveInDay = dayOf(unit.moveInDate);
        return {
          unitId: unit.id,
          plotNumber: unit.plotNumber,
          tenantName: unit.tenantName!.trim(),
          moveInDate: unit.moveInDate?.toISOString() ?? null,
          monthlyRent: unit.monthlyRent,
          maintenanceAmount: unit.maintenanceAmount ?? 0,
          // A saved payment belongs to one move-in date; ignore it if that date has since changed.
          paidByTenth: moveInDay && unit.moveInPaidFor === moveInDay ? unit.moveInPaid ?? null : null,
        };
      }),
  };
  return NextResponse.json(response);
}

export async function PATCH(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parsed = moveInPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  const { unitId, paidByTenth } = parsed.data;

  const unit = await unitById(unitId);
  if (!unit) return NextResponse.json({ error: "Plot not found." }, { status: 404 });
  const moveInDay = dayOf(unit.moveInDate);
  if (!moveInDay) return NextResponse.json({ error: "Set a move-in date for this plot first." }, { status: 400 });

  await updateUnit(unitId, { moveInPaid: paidByTenth, moveInPaidFor: paidByTenth === null ? null : moveInDay });
  // Not recordType "Unit": those logs are replayed to rebuild tenant history.
  await recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "SET_MOVE_IN_PAYMENT",
    recordType: "MoveInPayment",
    recordId: unitId,
    previousValue: { paidByTenth: unit.moveInPaidFor === moveInDay ? unit.moveInPaid ?? null : null },
    newValue: { paidByTenth, moveInDate: moveInDay },
  });
  return NextResponse.json({ paidByTenth });
}
