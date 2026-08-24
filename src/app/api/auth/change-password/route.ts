import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAuthedAdmin } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";
import { recordAuditLog } from "@/lib/audit";
import { withErrorHandling } from "@/lib/apiHandler";

export const POST = withErrorHandling(async (request: NextRequest) => {
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

  const record = await prisma.admin.findUnique({ where: { id: admin.id } });
  if (!record) {
    return NextResponse.json({ error: "Admin not found." }, { status: 404 });
  }

  const matches = await bcrypt.compare(parsed.data.currentPassword, record.passwordHash);
  if (!matches) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.admin.update({
    where: { id: admin.id },
    data: { passwordHash: newHash },
  });

  await recordAuditLog({
    adminId: admin.id,
    action: "CHANGE_PASSWORD",
    recordType: "Admin",
    recordId: admin.id,
  });

  return NextResponse.json({ ok: true });
});
