import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin, findAdmin, saveAdminPassword, verifyPassword } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const record = await findAdmin(admin.username);
  if (!record || !(await verifyPassword(parsed.data.currentPassword, record.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  await saveAdminPassword(admin.id, parsed.data.newPassword);

  await recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "CHANGE_PASSWORD",
    recordType: "Admin",
    recordId: admin.id,
  });

  return NextResponse.json({ ok: true });
}
