import { withErrorHandling } from "@/lib/apiHandler";
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";

export const GET = withErrorHandling(async () => {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, username: admin.username });
});
