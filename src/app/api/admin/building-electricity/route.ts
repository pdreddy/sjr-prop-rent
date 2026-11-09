import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/auth";
import {
  getDocument,
  newDocumentId,
  setDocument,
  type FirebaseValue,
} from "@/lib/firebase";
import { monthSchema } from "@/lib/validation";
import {
  calculateElectricity,
  DEFAULT_ELECTRICITY_INPUT,
  electricityInputSchema,
  type ElectricityRecord,
} from "@/lib/buildingElectricity";

const saveSchema = z.object({
  month: monthSchema,
  input: electricityInputSchema,
});
const failure = () =>
  NextResponse.json(
    { error: "Could not access the building bill. Please retry." },
    { status: 503 },
  );

export async function GET(request: NextRequest) {
  try {
    const admin = await getAuthedAdmin();
    if (!admin || admin.role !== "ADMIN")
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 401 },
      );
    const month = monthSchema.safeParse(
      request.nextUrl.searchParams.get("month"),
    );
    if (!month.success)
      return NextResponse.json(
        { error: "Choose a valid month." },
        { status: 400 },
      );
    const raw = await getDocument<ElectricityRecord>(
      `buildingElectricityBills/${month.data}`,
    );
    const record = raw
      ? {
          ...raw,
          input: {
            ...DEFAULT_ELECTRICITY_INPUT,
            ...raw.input,
            taxableComponents: raw.input.taxableComponents ?? [],
            originalBillAmount: raw.input.originalBillAmount ?? null,
          },
        }
      : null;
    return NextResponse.json(
      { month: month.data, record },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAuthedAdmin();
    if (!admin || admin.role !== "ADMIN")
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 401 },
      );
    const parsed = saveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid bill." },
        { status: 400 },
      );
    const { month, input } = parsed.data;
    const path = `buildingElectricityBills/${month}`;
    const previous = await getDocument<ElectricityRecord>(path);
    const record: ElectricityRecord = {
      input,
      calculation: calculateElectricity(input),
      updatedBy: admin.username,
      updatedAt: Date.now(),
    };
    // A single multi-location PATCH saves the bill and audit entry in the existing
    // database namespace. The existing tenant electricity/rent records are untouched.
    await setDocument(
      "",
      {
        [path]: record as unknown as FirebaseValue,
        [`auditLogs/${newDocumentId()}`]: {
          adminId: admin.id,
          adminUsername: admin.username,
          action: previous ? "UPDATE" : "CREATE",
          recordType: "BuildingElectricityBill",
          recordId: month,
          previousValue: previous as unknown as FirebaseValue,
          newValue: record as unknown as FirebaseValue,
          createdAt: new Date(),
        },
      },
      true,
    );
    return NextResponse.json(
      { month, record },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure();
  }
}
