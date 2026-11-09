import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/auth";
import { allUnits, updateUnit } from "@/lib/store";
import { ACCESS_CODE_PATTERN, generateAccessCode } from "@/lib/accessCode";
import { recordAuditLog } from "@/lib/audit";

// Manage the private codes tenants use (with their plot number) to open their own account.
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate-missing") }),
  z.object({ action: z.literal("regenerate"), unitId: z.string().min(1) }),
  z.object({ action: z.literal("set"), unitId: z.string().min(1), code: z.string().regex(ACCESS_CODE_PATTERN, "Code must be exactly 6 digits.") }),
  z.object({ action: z.literal("clear"), unitId: z.string().min(1) }),
]);

export async function POST(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  const body = parsed.data;

  const units = await allUnits();
  const taken = new Set(units.map((u) => u.accessCode).filter((c): c is string => !!c));
  const reset = { accessFailedAttempts: 0, accessLockedUntil: null };
  let changed = 0;

  if (body.action === "generate-missing") {
    for (const unit of units.filter((u) => u.active && !u.accessCode)) {
      const code = generateAccessCode(taken);
      taken.add(code);
      await updateUnit(unit.id, { accessCode: code, ...reset });
      changed++;
    }
  } else {
    const unit = units.find((u) => u.id === body.unitId);
    if (!unit) return NextResponse.json({ error: "Plot not found." }, { status: 404 });
    let code: string | null;
    if (body.action === "clear") code = null;
    else if (body.action === "set") {
      if (units.some((u) => u.id !== unit.id && u.accessCode === body.code)) return NextResponse.json({ error: "Another plot already uses that code." }, { status: 409 });
      code = body.code;
    } else code = generateAccessCode(taken);
    await updateUnit(unit.id, { accessCode: code, ...reset });
    changed = 1;
  }

  // The codes themselves are deliberately not written to the audit log.
  await recordAuditLog({ adminId: admin.id, adminUsername: admin.username, action: "UPDATE", recordType: "AccessCodes", recordId: "unitId" in body ? body.unitId : null, newValue: { action: body.action, changed } });
  return NextResponse.json({ changed });
}
