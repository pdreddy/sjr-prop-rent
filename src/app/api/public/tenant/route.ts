import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allPayments, allUnits, getElectricityConfig, getGeneralSettings, updateUnit } from "@/lib/store";
import { codesMatch, ACCESS_CODE_PATTERN } from "@/lib/accessCode";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { BUILDING_READY_MONTH, MAX_FAILED_TENANT_CODE_ATTEMPTS, TENANT_LOCKOUT_MINUTES } from "@/lib/constants";
import { getCurrentMonth, isBeforeFirstRentMonth, isRentOverdue, firstRentMonth } from "@/lib/month";
import { computeElectricityUnits, hasMeterReading } from "@/lib/electricity";
import { buildElectricityStatement, monthsBetween } from "@/lib/electricityLedger";
import { expectedForMonth } from "@/lib/proration";
import type { PublicElectricityMonth, TenantAccountResponse, TenantRentMonth } from "@/lib/types";

export const dynamic = "force-dynamic";

const schema = z.object({ plotNumber: z.string().trim().min(1).max(50), code: z.string().trim().regex(ACCESS_CODE_PATTERN) });
const cents = (n: number) => Math.round(n * 100) / 100;
// One message for every failure (unknown plot, wrong code, no code set) so plots can't be probed.
const DENIED = "Plot number or access code is incorrect.";

// A tenant signs in with their plot number and private code and receives ONLY their own account.
// There is deliberately no endpoint that lists plots, so tenants cannot see each other's rent.
export async function POST(request: NextRequest) {
  const limit = checkRateLimit(`tenant:${getClientIp(request)}`, 20, 15 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: DENIED }, { status: 401 });
  const { plotNumber, code } = parsed.data;

  const general = await getGeneralSettings();
  if (!general.portalEnabled) return NextResponse.json({ error: "The tenant portal is currently switched off." }, { status: 403 });

  const [units, payments, electricity] = await Promise.all([allUnits(), allPayments(), getElectricityConfig()]);
  const unit = units.find((u) => u.active && u.plotNumber.toLowerCase() === plotNumber.toLowerCase());
  if (!unit || !unit.accessCode) return NextResponse.json({ error: DENIED }, { status: 401 });

  if (unit.accessLockedUntil && unit.accessLockedUntil.getTime() > Date.now()) {
    return NextResponse.json({ error: `Too many wrong codes. Try again in ${TENANT_LOCKOUT_MINUTES} minutes or ask the owner to reset your code.` }, { status: 429 });
  }
  if (!codesMatch(unit.accessCode, code)) {
    const attempts = (unit.accessFailedAttempts ?? 0) + 1;
    const lock = attempts >= MAX_FAILED_TENANT_CODE_ATTEMPTS;
    await updateUnit(unit.id, { accessFailedAttempts: lock ? 0 : attempts, accessLockedUntil: lock ? new Date(Date.now() + TENANT_LOCKOUT_MINUTES * 60_000) : null });
    return NextResponse.json({ error: DENIED }, { status: 401 });
  }
  if (unit.accessFailedAttempts) await updateUnit(unit.id, { accessFailedAttempts: 0, accessLockedUntil: null });

  const currentMonth = getCurrentMonth();
  const mine = payments.filter((p) => p.unitId === unit.id);
  const moveInDate = unit.moveInDate?.toISOString() ?? null;

  // Rent: every month from the first rent month through now (what was recorded, or what is expected).
  let rentStart = firstRentMonth(moveInDate) ?? mine.map((p) => p.month).sort()[0] ?? currentMonth;
  if (rentStart < BUILDING_READY_MONTH) rentStart = BUILDING_READY_MONTH;
  const rentMonths: TenantRentMonth[] = rentStart <= currentMonth
    ? monthsBetween(rentStart, currentMonth)
        .filter((month) => !isBeforeFirstRentMonth(moveInDate, month))
        .map((month) => {
          const record = mine.find((p) => p.month === month);
          const expected = expectedForMonth({ monthlyRent: unit.monthlyRent, maintenanceAmount: unit.maintenanceAmount, moveInDate }, month);
          const rentDue = record ? record.rentAmount + record.maintenanceAmount : expected.rent + expected.maintenance;
          const paid = record?.amountPaid ?? 0;
          const status = record?.paymentStatus ?? "UNPAID";
          return {
            month,
            status: status === "UNPAID" && !isRentOverdue(month) ? ("DUE" as const) : status,
            rentDue, paid, balance: Math.max(0, rentDue - paid),
            paidDate: record?.paidDate?.toISOString() ?? null,
          };
        })
        .reverse()
    : [];
  const rentTotals = {
    due: rentMonths.reduce((s, m) => s + m.rentDue, 0),
    paid: rentMonths.reduce((s, m) => s + m.paid, 0),
    balance: rentMonths.reduce((s, m) => s + m.balance, 0),
  };

  // Electricity: every recorded month's units, bill, paid and balance, newest first.
  let eStart = moveInDate?.slice(0, 7) ?? mine.map((p) => p.month).sort()[0] ?? BUILDING_READY_MONTH;
  if (eStart < BUILDING_READY_MONTH) eStart = BUILDING_READY_MONTH;
  const electricityMonths: PublicElectricityMonth[] =
    unit.tenantName?.trim() && eStart <= currentMonth
      ? buildElectricityStatement(mine, electricity, eStart, currentMonth, unit.plotNumber)
          .filter((m) => m.recorded)
          .map((m) => {
            const record = mine.find((p) => p.month === m.month);
            return {
              month: m.month,
              prevReading: record?.prevReading ?? 0,
              currReading: record?.currReading ?? 0,
              units: computeElectricityUnits(record?.prevReading ?? 0, record?.currReading ?? 0),
              isDefault: !hasMeterReading(record?.currReading),
              bill: cents(m.electricityBill),
              paid: cents(m.credited),
              balance: cents(m.balance),
              status: (m.balance <= 0 ? "PAID" : m.credited > 0 ? "PARTIAL" : "UNPAID") as "PAID" | "PARTIAL" | "UNPAID",
            };
          })
          .reverse()
      : [];

  const body: TenantAccountResponse = {
    buildingName: general.buildingName,
    notice: general.notice,
    ratePerUnit: electricity.ratePerUnit,
    plotNumber: unit.plotNumber,
    tenantName: unit.tenantName,
    moveInDate,
    monthlyRent: unit.monthlyRent,
    maintenanceAmount: unit.maintenanceAmount,
    rentMonths,
    rentTotals,
    electricityMonths,
    electricityTotals: {
      billed: cents(electricityMonths.reduce((s, m) => s + m.bill, 0)),
      paid: cents(electricityMonths.reduce((s, m) => s + m.paid, 0)),
      due: cents(electricityMonths.reduce((s, m) => s + m.balance, 0)),
    },
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
