import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { allPayments, allUnits, unitSnapshots } from "@/lib/store";
import { getCurrentMonth } from "@/lib/month";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { expectedForMonth } from "@/lib/proration";
import { buildStays, monthsOfStay } from "@/lib/rentalHistory";
import type { RentalHistoryResponse } from "@/lib/types";

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
        if (stays[0] && earliest && earliest < stays[0].startMonth) stays[0].startMonth = earliest;
        if (stays[0] && stays[0].startMonth < BUILDING_READY_MONTH) stays[0].startMonth = BUILDING_READY_MONTH;

        return {
          unitId: unit.id,
          plotNumber: unit.plotNumber,
          currentTenant: unit.tenantName?.trim() || null,
          stays: stays
            .map((stay) => {
              const months = monthsOfStay(stay, currentMonth).map((month) => {
                const p = unitPayments.find((item) => item.month === month);
                // No record: show what was owed (prorated in the move-in month) so empty months aren't blank.
                const expected = expectedForMonth({ ...unit, moveInDate: stay.moveInDate }, month);
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
                };
              });
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
            .reverse(), // latest tenant first
        };
      })
  );

  const response: RentalHistoryResponse = { currentMonth, plots };
  return NextResponse.json(response);
}
