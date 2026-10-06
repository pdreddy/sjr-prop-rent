import { NextRequest, NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { allPayments, allUnits, getElectricityRate, savePayment } from "@/lib/store";
import { getCurrentMonth } from "@/lib/month";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { computeElectricityAmount } from "@/lib/electricity";
import { monthsBetween } from "@/lib/electricityLedger";
import { expectedForMonth } from "@/lib/proration";
import { recordAuditLog } from "@/lib/audit";

// Fills in months that have no payment record between each tenant's move-in month and now, and
// corrects an unpaid move-in-month record that was saved at the full (un-prorated) rent.
// Nothing that already has a payment against it is changed. POST { dryRun: true } only counts.
export async function POST(request: NextRequest) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const dryRun = body?.dryRun === true;

  const [units, payments, rate] = await Promise.all([allUnits(), allPayments(), getElectricityRate()]);
  const currentMonth = getCurrentMonth();
  let created = 0;
  let adjusted = 0;
  let needsReview = 0; // move-in month already has payments recorded at the full rent

  for (const unit of units) {
    if (!unit.active || !unit.tenantName?.trim() || !unit.moveInDate) continue;
    let start = unit.moveInDate.toISOString().slice(0, 7);
    if (start < BUILDING_READY_MONTH) start = BUILDING_READY_MONTH;
    if (start > currentMonth) continue;

    const unitPayments = payments.filter((p) => p.unitId === unit.id);
    let lastReading = 0; // meter reading carried into the next created month

    for (const month of monthsBetween(start, currentMonth)) {
      const existing = unitPayments.find((p) => p.month === month);
      const expected = expectedForMonth(unit, month);

      if (existing) {
        lastReading = existing.currReading || existing.prevReading || lastReading;
        if (!expected.proration.prorated) continue;
        const fullSum = unit.monthlyRent + unit.maintenanceAmount;
        if (existing.rentAmount + existing.maintenanceAmount !== fullSum) continue; // already prorated or customised
        if (existing.amountPaid > 0) {
          needsReview++;
          continue;
        }
        adjusted++;
        if (!dryRun) {
          await savePayment(unit.id, month, {
            paymentStatus: existing.paymentStatus,
            rentAmount: expected.rent,
            maintenanceAmount: expected.maintenance,
            amountPaid: 0,
            balanceDue: expected.rent + expected.maintenance,
            paidDate: existing.paidDate,
            notes: existing.notes,
            prevReading: existing.prevReading ?? 0,
            currReading: existing.currReading ?? 0,
            electricityAmount: computeElectricityAmount(existing.prevReading ?? 0, existing.currReading ?? 0, rate),
            electricityPaid: existing.electricityPaid ?? false,
            updatedBy: admin.username,
          });
        }
        continue;
      }

      created++;
      if (!dryRun) {
        await savePayment(unit.id, month, {
          paymentStatus: "UNPAID",
          rentAmount: expected.rent,
          maintenanceAmount: expected.maintenance,
          amountPaid: 0,
          balanceDue: expected.rent + expected.maintenance,
          paidDate: null,
          notes: null,
          prevReading: lastReading,
          currReading: 0, // entered when the meter is read
          electricityAmount: 0,
          electricityPaid: false,
          updatedBy: admin.username,
        });
      }
    }
  }

  if (!dryRun && (created > 0 || adjusted > 0)) {
    await recordAuditLog({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "BACKFILL_MONTHS",
      recordType: "Payment",
      newValue: { created, adjusted, needsReview },
    });
  }
  return NextResponse.json({ dryRun, created, adjusted, needsReview });
}
