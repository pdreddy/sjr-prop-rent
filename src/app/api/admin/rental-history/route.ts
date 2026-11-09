import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { allPayments, allUnits, unitSnapshots } from "@/lib/store";
import { getCurrentMonth } from "@/lib/month";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { expectedForMonth } from "@/lib/proration";
import { buildStays, monthsOfStay } from "@/lib/rentalHistory";
import type { RentalHistoryMonth, RentalHistoryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const [units, payments] = await Promise.all([allUnits(), allPayments()]);
  const currentMonth = getCurrentMonth();

  const plots = await Promise.all(
    units
      .filter((unit) => unit.active)
      .map(async (unit) => {
        const unitPayments = payments.filter((p) => p.unitId === unit.id);
        const stays = buildStays(await unitSnapshots(unit.id, unit), currentMonth);
        // Payments dated before the first known stay belong to it too.
        const earliest = unitPayments.map((p) => p.month).sort()[0];
        // Only a stay with no known move-in date is stretched back to its earliest record; with a move-in
        // date, rent starts the month after it and an earlier record is not billed.
        if (stays[0] && !stays[0].moveInDate && earliest && earliest < stays[0].startMonth) stays[0].startMonth = earliest;
        if (stays[0] && stays[0].startMonth < BUILDING_READY_MONTH) stays[0].startMonth = BUILDING_READY_MONTH;

        const toMonth = (month: string, p: (typeof unitPayments)[number] | undefined, moveInDate: string | null): RentalHistoryMonth => {
          // No record: show what was owed (prorated in the first rent month) so empty months aren't blank.
          const expected = expectedForMonth({ ...unit, moveInDate }, month);
          const owed = expected.rent + expected.maintenance;
          return {
            month,
            recorded: !!p,
            status: p?.paymentStatus ?? null,
            due: p ? p.rentAmount + p.maintenanceAmount : owed,
            amountPaid: p?.amountPaid ?? 0,
            balanceDue: p ? p.balanceDue : owed,
            paidDate: p?.paidDate?.toISOString() ?? null,
            proratedDays: expected.proration.prorated ? expected.proration.days : null,
            rentAmount: p?.rentAmount ?? expected.rent,
            maintenanceAmount: p?.maintenanceAmount ?? expected.maintenance,
            notes: p?.notes ?? null,
            prevReading: p?.prevReading ?? 0,
            currReading: p?.currReading ?? 0,
            electricityPaid: p?.electricityPaid ?? false,
          };
        };
        const builtStays = stays
          .map((stay) => {
            const months = monthsOfStay(stay, currentMonth).map((month) => toMonth(month, unitPayments.find((item) => item.month === month), stay.moveInDate));
            return {
              tenantName: stay.tenantName,
              moveInDate: stay.moveInDate,
              movedOutDate: stay.movedOutDate,
              startMonth: stay.startMonth,
              endMonth: stay.endMonth,
              monthsPaid: months.filter((m) => m.status === "PAID").length,
              totalPaid: months.reduce((sum, m) => sum + m.amountPaid, 0),
              months,
            };
          })
          .reverse(); // latest tenant first
        const shown = new Set(builtStays.flatMap((stay) => stay.months.map((m) => m.month)));

        return {
          unitId: unit.id,
          plotNumber: unit.plotNumber,
          currentTenant: unit.tenantName?.trim() || null,
          moveInDate: unit.moveInDate?.toISOString() ?? null,
          monthlyRent: unit.monthlyRent,
          maintenanceAmount: unit.maintenanceAmount ?? 0,
          stays: builtStays,
          // Anything not inside a stay (a payment filed under the wrong month) stays visible and fixable.
          otherRecords: unitPayments
            .filter((p) => !shown.has(p.month))
            .sort((x, y) => x.month.localeCompare(y.month))
            .map((p) => toMonth(p.month, p, unit.moveInDate?.toISOString() ?? null)),
        };
      })
  );

  const response: RentalHistoryResponse = { currentMonth, plots };
  return NextResponse.json(response);
}
