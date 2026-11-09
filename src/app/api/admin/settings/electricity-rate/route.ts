import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { getElectricityRate, setElectricityRate } from "@/lib/store";
import { recordAuditLog } from "@/lib/audit";

// Only ADMIN may change the rate; SECURITY logins just enter meter readings.
export async function GET() {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return NextResponse.json({ ratePerUnit: await getElectricityRate() });
}

export async function PUT(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const rate = Number(body?.ratePerUnit);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1000) {
    return NextResponse.json({ error: "Rate must be a number between 0 and 1000." }, { status: 400 });
  }
  const rounded = Math.round(rate * 100) / 100;

  const previous = await getElectricityRate();
  await setElectricityRate(rounded, admin.username);
  await recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "UPDATE",
    recordType: "ElectricityRate",
    previousValue: { ratePerUnit: previous },
    newValue: { ratePerUnit: rounded },
  });
  return NextResponse.json({ ratePerUnit: rounded });
}
