import { withErrorHandling } from "@/lib/apiHandler";
import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { getBuildingBill, setBuildingBill } from "@/lib/store";
import { buildingBillSchema } from "@/lib/validation";

// The building's actual power bill for a month (what the electricity company charged for the whole
// building). ADMIN only. Shown on the public page next to the total billed to tenants.
export const PUT = withErrorHandling(async (request: NextRequest) => {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parsed = buildingBillSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  const { month, amount } = parsed.data;

  const previous = await getBuildingBill(month);
  await setBuildingBill(month, amount, admin.username);
  await recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: amount === null ? "DELETE" : previous === null ? "CREATE" : "UPDATE",
    recordType: "BuildingBill",
    recordId: `building_${month}`,
    previousValue: previous === null ? null : { month, amount: previous },
    newValue: amount === null ? null : { month, amount },
  });
  return NextResponse.json({ month, amount });
});
