import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`login:${ip}`, 10, 5 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 400 });
  }

  try {
    const result = await login(parsed.data.username, parsed.data.password);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Login failed with an unexpected error:", err);
    return NextResponse.json(
      { error: "Server error while signing in. Check the server logs for details." },
      { status: 500 }
    );
  }
}
