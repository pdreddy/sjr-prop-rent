import { BUILDING_READY_MONTH } from "./constants";
import { describeFormula } from "./electricity";
import { buildElectricityStatement, type StatementMonth, type StatementPayment } from "./electricityLedger";
import { getPreviousMonth, isBeforeFirstRentMonth } from "./month";
import { expectedForMonth } from "./proration";
import type { ElectricityConfig } from "./config";
import type { PaymentStatus, SummaryResponse, SummaryTrendMonth } from "./types";

export interface SummaryUnit {
  id: string;
  plotNumber: string;
  tenantName: string | null;
  active: boolean;
  monthlyRent: number;
  maintenanceAmount: number;
  moveInDate: Date | null;
}
export interface SummaryPayment extends StatementPayment {
  unitId: string;
  paymentStatus: PaymentStatus;
}

const TREND_MONTHS = 6;
const cents = (n: number) => Math.round(n * 100) / 100;

/** Everything the admin Summary tab shows for one month, computed from the same rules as the other tabs. */
export function buildSummary(units: SummaryUnit[], payments: SummaryPayment[], config: ElectricityConfig, month: string): SummaryResponse {
  const active = units.filter((u) => u.active);
  const occupied = active.filter((u) => u.tenantName?.trim());
  const paymentOf = new Map(payments.map((p) => [`${p.unitId}_${p.month}`, p]));

  // Rent for one tenant in one month: the recorded amounts, or what is expected when nothing is recorded.
  const rentFor = (unit: SummaryUnit, m: string) => {
    if (isBeforeFirstRentMonth(unit.moveInDate, m)) return null; // rent has not started yet
    const payment = paymentOf.get(`${unit.id}_${m}`);
    const expected = payment
      ? payment.rentAmount + payment.maintenanceAmount
      : (() => {
          const e = expectedForMonth(unit, m);
          return e.rent + e.maintenance;
        })();
    return { expected, collected: payment?.amountPaid ?? 0, status: (payment?.paymentStatus ?? "UNPAID") as PaymentStatus, payment };
  };

  // Electricity statement per tenant, from their first month up to the selected month (ledger credit carries forward).
  const statements = new Map<string, Map<string, StatementMonth>>();
  for (const unit of occupied) {
    const own = payments.filter((p) => p.unitId === unit.id);
    let start = unit.moveInDate?.toISOString().slice(0, 7) ?? own.map((p) => p.month).sort()[0] ?? BUILDING_READY_MONTH;
    if (start < BUILDING_READY_MONTH) start = BUILDING_READY_MONTH;
    const rows = start <= month ? buildElectricityStatement(own, config, start, month, unit.plotNumber) : [];
    statements.set(unit.id, new Map(rows.filter((r) => r.recorded).map((r) => [r.month, r])));
  }

  const months: string[] = [];
  for (let m = month, i = 0; i < TREND_MONTHS && m >= BUILDING_READY_MONTH; m = getPreviousMonth(m), i++) months.unshift(m);
  if (!months.includes(month)) months.push(month);

  const trend: SummaryTrendMonth[] = months.map((m) => {
    const t: SummaryTrendMonth = { month: m, rentExpected: 0, rentCollected: 0, electricityBilled: 0, electricityCovered: 0, electricityDue: 0 };
    for (const unit of occupied) {
      const rent = rentFor(unit, m);
      if (rent) {
        t.rentExpected += rent.expected;
        t.rentCollected += rent.collected;
      }
      const e = statements.get(unit.id)?.get(m);
      if (e && e.electricityBill > 0) {
        t.electricityBilled += e.electricityBill;
        t.electricityCovered += e.credited;
        t.electricityDue += e.balance;
      }
    }
    for (const key of Object.keys(t) as (keyof SummaryTrendMonth)[]) if (key !== "month") t[key] = cents(t[key] as number);
    return t;
  });

  const rent = { expected: 0, collected: 0, counts: { paid: 0, partial: 0, unpaid: 0 } };
  const electricity = { billed: 0, covered: 0, due: 0, readingsEntered: 0, counts: { paid: 0, partial: 0, unpaid: 0, none: 0 } };
  const topDue: SummaryResponse["topDue"] = [];
  let applicable = 0;
  for (const unit of occupied) {
    const r = rentFor(unit, month);
    if (!r) continue;
    applicable++;
    rent.expected += r.expected;
    rent.collected += r.collected;
    if (r.status === "PAID") rent.counts.paid++;
    else if (r.status === "PARTIAL") rent.counts.partial++;
    else rent.counts.unpaid++;

    if ((r.payment?.currReading ?? 0) > 0) electricity.readingsEntered++;
    const e = statements.get(unit.id)?.get(month);
    if (e && (e.electricityBill > 0 || e.markedPaid)) {
      electricity.billed += e.electricityBill;
      electricity.covered += e.credited;
      electricity.due += e.balance;
      if (e.status === "PAID") electricity.counts.paid++;
      else if (e.status === "PARTIAL") electricity.counts.partial++;
      else electricity.counts.unpaid++;
    } else {
      electricity.counts.none++;
    }
    const rentDue = Math.max(0, r.expected - r.collected);
    const electricityDue = e?.balance ?? 0;
    if (rentDue + electricityDue > 0)
      topDue.push({ plotNumber: unit.plotNumber, tenantName: unit.tenantName, rentDue: cents(rentDue), electricityDue: cents(electricityDue), total: cents(rentDue + electricityDue) });
  }
  topDue.sort((a, b) => b.total - a.total);

  return {
    month,
    plots: { total: active.length, occupied: occupied.length, vacant: active.length - occupied.length, notStarted: occupied.length - applicable, applicable },
    rent: {
      expected: cents(rent.expected),
      collected: cents(rent.collected),
      outstanding: cents(Math.max(0, rent.expected - rent.collected)),
      collectedPct: rent.expected > 0 ? Math.min(100, Math.round((rent.collected / rent.expected) * 100)) : 0,
      counts: rent.counts,
    },
    electricity: {
      billed: cents(electricity.billed),
      covered: cents(electricity.covered),
      due: cents(electricity.due),
      readingsEntered: electricity.readingsEntered,
      readingsExpected: applicable,
      counts: electricity.counts,
      formula: describeFormula(config, month),
    },
    trend,
    topDue: topDue.slice(0, 6),
  };
}
