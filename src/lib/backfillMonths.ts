import { BUILDING_READY_MONTH } from "./constants";
import { computeElectricityAmount } from "./electricity";
import { monthsBetween } from "./electricityLedger";
import { getCurrentMonth, firstRentMonth } from "./month";
import { expectedForMonth } from "./proration";
import { allPayments, allUnits, getElectricityRate, paymentStatus, savePayment } from "./store";
import { deleteDocument } from "./firebase";

export interface BackfillResult {
  created: number;
  adjusted: number;
  /** First rent record already has a payment at the full (un-prorated) rent. */
  needsReview: number;
  /** Empty records dated before a tenant's first rent month that were deleted (removeEmpty only). */
  removed: number;
  /** Payments moved from a record before the first rent month into the first rent record (moveEarly only). */
  moved: number;
  /** Plain-English notes about records left alone that someone should look at. */
  notes: string[];
}

// A tenant's rent records run from the month AFTER move-in (that first record pays the move-in
// month, prorated) up to the current month. This fills any missing month, re-prices an unpaid first
// record that was saved at the full rent, and - with removeEmpty - deletes completely empty records
// from before the first rent month. Nothing that has a payment or a meter reading is ever changed or
// deleted. dryRun only counts.
export async function backfillMonths(opts: { dryRun: boolean; removeEmpty?: boolean; moveEarly?: boolean; updatedBy: string }): Promise<BackfillResult> {
  const [units, payments, rate] = await Promise.all([allUnits(), allPayments(), getElectricityRate()]);
  const currentMonth = getCurrentMonth();
  const result: BackfillResult = { created: 0, adjusted: 0, needsReview: 0, removed: 0, moved: 0, notes: [] };

  for (const unit of units) {
    if (!unit.active || !unit.tenantName?.trim() || !unit.moveInDate) continue;
    const first = firstRentMonth(unit.moveInDate)!;
    const label = `Plot ${unit.plotNumber} (${unit.tenantName.trim()})`;
    let unitPayments = payments.filter((p) => p.unitId === unit.id);

    for (const early of unitPayments.filter((p) => p.month < first)) {
      const hasPayment = (early.amountPaid ?? 0) > 0;
      const hasReading = (early.prevReading ?? 0) > 0 || (early.currReading ?? 0) > 0 || early.electricityPaid;
      if (hasPayment && opts.moveEarly) {
        const target = unitPayments.find((p) => p.month === first);
        if (target && (target.amountPaid ?? 0) > 0) {
          result.notes.push(`${label}: ${early.month} (₹${early.amountPaid}) and ${first} (₹${target.amountPaid}) both have payments - left alone, merge by hand.`);
          continue;
        }
        // The payment becomes the first rent record, re-priced to what that record owes (prorated
        // move-in month). Meter readings stay with the month they were taken in: an existing first
        // record keeps its own readings, a new one starts from the old month's closing reading.
        const expected = expectedForMonth(unit, first);
        const due = expected.rent + expected.maintenance;
        const meter = target ?? { prevReading: early.currReading || early.prevReading || 0, currReading: 0, electricityPaid: false };
        const moved = {
          paymentStatus: paymentStatus(early.amountPaid, due),
          rentAmount: expected.rent,
          maintenanceAmount: expected.maintenance,
          amountPaid: early.amountPaid,
          balanceDue: Math.max(0, due - early.amountPaid),
          paidDate: early.paidDate,
          notes: [target?.notes, early.notes].filter(Boolean).join("\n") || null,
          prevReading: meter.prevReading ?? 0,
          currReading: meter.currReading ?? 0,
          electricityAmount: computeElectricityAmount(meter.prevReading ?? 0, meter.currReading ?? 0, rate),
          electricityPaid: meter.electricityPaid ?? false,
          updatedBy: opts.updatedBy,
        };
        result.moved++;
        if (!opts.dryRun) {
          await savePayment(unit.id, first, moved);
          if (hasReading) {
            await savePayment(unit.id, early.month, { ...moved, paymentStatus: "UNPAID", rentAmount: early.rentAmount, maintenanceAmount: early.maintenanceAmount, amountPaid: 0, balanceDue: 0, paidDate: null, notes: early.notes, prevReading: early.prevReading ?? 0, currReading: early.currReading ?? 0, electricityAmount: early.electricityAmount ?? 0, electricityPaid: early.electricityPaid ?? false });
          } else await deleteDocument(`payments/${early.id}`);
        }
        // Keep the in-memory list in step so the fill below sees the moved record.
        unitPayments = unitPayments.filter((p) => p.id !== early.id && p.id !== target?.id);
        unitPayments.push({ ...(target ?? early), ...moved, id: `${unit.id}_${first}`, unitId: unit.id, month: first, createdAt: target?.createdAt ?? early.createdAt, updatedAt: new Date() });
      } else if (hasPayment) {
        result.notes.push(`${label}: ${early.month} has ₹${early.amountPaid} recorded but rent only starts ${first}. Re-run with --move-early to move it into ${first}.`);
      } else if (!hasReading && opts.removeEmpty) {
        result.removed++;
        if (!opts.dryRun) await deleteDocument(`payments/${early.id}`);
      }
    }

    let start = first;
    if (start < BUILDING_READY_MONTH) start = BUILDING_READY_MONTH;
    if (start > currentMonth) continue;
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
          result.needsReview++;
          continue;
        }
        result.adjusted++;
        if (!opts.dryRun) {
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
            updatedBy: opts.updatedBy,
          });
        }
        continue;
      }

      result.created++;
      if (!opts.dryRun) {
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
          updatedBy: opts.updatedBy,
        });
      }
    }
  }
  return result;
}
