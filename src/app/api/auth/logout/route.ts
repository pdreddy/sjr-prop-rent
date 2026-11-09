import { withErrorHandling } from "@/lib/apiHandler";
import { NextResponse } from "next/server";
import { logout } from "@/lib/auth";

export const POST = withErrorHandling(async () => {
  await logout();
  return NextResponse.json({ ok: true });
});
