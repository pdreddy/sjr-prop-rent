import { NextResponse } from "next/server";
import { getElectricityConfig, getGeneralSettings } from "@/lib/store";
import type { PublicInfoResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// Anonymous visitors only get building-level information: no plots, tenants, rent or payments.
export async function GET() {
  const [general, electricity] = await Promise.all([getGeneralSettings(), getElectricityConfig()]);
  const body: PublicInfoResponse = { buildingName: general.buildingName, ratePerUnit: electricity.ratePerUnit, portalEnabled: general.portalEnabled, notice: general.notice };
  return NextResponse.json(body);
}
