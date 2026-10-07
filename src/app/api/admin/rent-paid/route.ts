import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { allPayments, allUnits } from "@/lib/store";
import { firstRentMonth, getCurrentMonth, isBeforeBuildingOpened } from "@/lib/month";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { monthsBetween } from "@/lib/electricityLedger";
import { expectedForMonth } from "@/lib/proration";
import { electricityPortionOfExcess } from "@/lib/electricity";
import type { RentPaidResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const [units, payments] = await Promise.all([allUnits(), allPayments()]);
  const currentMonth = getCurrentMonth();

  const response: RentPaidResponse = {
    currentMonth,
    tenants: units
      .filter((unit) => unit.active && unit.tenantName?.trim())
      .map((unit) => {
        // A date before the building opened is a wrong year: bill nothing from it rather than from May.
        const first = isBeforeBuildingOpened(unit.moveInDate) ? null : firstRentMonth(unit.moveInDate);
        const start = first && first < BUILDING_READY_MONTH ? BUILDING_READY_MONTH : first;
        const months = start && start <= currentMonth ? monthsBetween(start, currentMonth) : [];
        // Money filed under the move-in month (e.g. rent entered a month early) is rent paid ahead. Earlier
        // months may belong to a previous tenant of the plot, so they are not applied.
        const moveInMonth = unit.moveInDate?.toISOString().slice(0, 7);
        const early = first ? payments.filter((p) => p.unitId === unit.id && p.month === moveInMonth) : [];
        const earlyPaid = early.reduce((sum, p) => sum + (p.amountPaid ?? 0), 0);
        // No usable move-in date: nothing is billed, but any payment on record is shown as paid.
        const unknownStartPaid = first === null ? payments.filter((p) => p.unitId === unit.id).reduce((sum, p) => sum + (p.amountPaid ?? 0), 0) : 0;
        let totalDue = 0, totalPaid = earlyPaid + unknownStartPaid, overRent = 0, balance = 0, advance = earlyPaid, monthsPaid = 0, lastPaid: Date | null = null;
        for (const p of early) if (p.amountPaid > 0 && p.paidDate && (!lastPaid || p.paidDate > lastPaid)) lastPaid = p.paidDate;
        for (const month of months) {
          const record = payments.find((p) => p.unitId === unit.id && p.month === month);
          const expected = expectedForMonth(unit, month);
          // No record yet: what the tenant owes for that month (prorated in the first one), paid 0.
          const due = record ? record.rentAmount + record.maintenanceAmount : expected.rent + expected.maintenance;
          const received = record?.amountPaid ?? 0;
          // A small excess over the month's rent (under ₹1,500) is an electricity payment; anything larger
          // stays rent (paid ahead).
          const toElectricity = electricityPortionOfExcess(received - due);
          const paid = received - toElectricity;
          const net = paid + advance - due;
          totalDue += due;
          totalPaid += paid;
          overRent += received - paid;
          balance += Math.max(0, -net);
          advance = Math.max(0, net);
          if (due > 0 && net >= 0) monthsPaid++;
          if (paid > 0 && record?.paidDate && (!lastPaid || record.paidDate > lastPaid)) lastPaid = record.paidDate;
        }
        return {
          unitId: unit.id,
          plotNumber: unit.plotNumber,
          tenantName: unit.tenantName!.trim(),
          moveInDate: unit.moveInDate?.toISOString() ?? null,
          firstRentMonth: first,
          monthsBilled: months.length,
          monthsPaid,
          totalDue,
          totalPaid,
          overRent,
          balance,
          lastPaidDate: lastPaid?.toISOString() ?? null,
        };
      }),
  };
  return NextResponse.json(response);
}
