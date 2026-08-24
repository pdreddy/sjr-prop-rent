import { NextResponse } from "next/server";
import { logout } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiHandler";

export const POST = withErrorHandling(async () => {
  await logout();
  return NextResponse.json({ ok: true });
});
