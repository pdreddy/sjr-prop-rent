import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/auth";
import { allPayments, allUnits } from "@/lib/store";
import { firstRentMonth, getCurrentMonth } from "@/lib/month";
import { BUILDING_READY_MONTH } from "@/lib/constants";
import { monthsBetween } from "@/lib/electricityLedger";
import { expectedForMonth } from "@/lib/proration";
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
        const first = firstRentMonth(unit.moveInDate);
        const start = first && first < BUILDING_READY_MONTH ? BUILDING_READY_MONTH : first;
        const months = start && start <= currentMonth ? monthsBetween(start, currentMonth) : [];
        let totalDue = 0, totalPaid = 0, overRent = 0, balance = 0, advance = 0, monthsPaid = 0, lastPaid: Date | null = null;
        for (const month of months) {
          const record = payments.find((p) => p.unitId === unit.id && p.month === month);
          const expected = expectedForMonth(unit, month);
          // No record yet: what the tenant owes for that month (prorated in the first one), paid 0.
          const due = record ? record.rentAmount + record.maintenanceAmount : expected.rent + expected.maintenance;
          const received = record?.amountPaid ?? 0;
          // Payments count as rent up to the plot's full monthly rent (a part-month first record included, so
          // the extra there is rent paid ahead); only the excess over that is an electricity payment.
          const threshold = expected.proration.prorated ? unit.monthlyRent + (unit.maintenanceAmount ?? 0) : due;
          const paid = Math.min(received, threshold);
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
