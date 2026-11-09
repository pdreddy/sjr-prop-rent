import { BUILDING_READY_MONTH } from "./constants";
import { describeFormula } from "./electricity";
import { getPreviousMonth, isBeforeMoveInMonth } from "./month";
import { buildLedgers, buildUnitMonthView } from "./monthView";
import type { LedgerRecord, LedgerUnit } from "./paymentHistory";
import type { ElectricityConfig } from "./config";
import type { SummaryResponse, SummaryTrendMonth } from "./types";

export interface SummaryUnit extends LedgerUnit {
  active: boolean;
}
export type SummaryPayment = LedgerRecord;

const TREND_MONTHS = 6;
const cents = (n: number) => Math.round(n * 100) / 100;

/** Everything the admin Summary tab shows for one month, read from the same ledgers as every other tab. */
export function buildSummary(units: SummaryUnit[], payments: SummaryPayment[], config: ElectricityConfig, month: string): SummaryResponse {
  const active = units.filter((u) => u.active);
  const occupied = active.filter((u) => u.tenantName?.trim());
  const paymentOf = new Map(payments.map((p) => [`${p.unitId}_${p.month}`, p]));
  const ledgers = buildLedgers(occupied, payments, config, month);
  const viewOf = (unit: SummaryUnit, m: string) => buildUnitMonthView(unit, ledgers.get(unit.id), paymentOf.get(`${unit.id}_${m}`), m);

  const months: string[] = [];
  for (let m = month, i = 0; i < TREND_MONTHS && m >= BUILDING_READY_MONTH; m = getPreviousMonth(m), i++) months.unshift(m);
  if (!months.includes(month)) months.push(month);

  const trend: SummaryTrendMonth[] = months.map((m) => {
    const t: SummaryTrendMonth = { month: m, rentExpected: 0, rentCollected: 0, electricityBilled: 0, electricityCovered: 0, electricityDue: 0 };
    for (const unit of occupied) {
      const view = viewOf(unit, m);
      if (view.applicable) {
        t.rentExpected += view.rent.due;
        t.rentCollected += view.rent.received;
      }
      t.electricityBilled += view.electricity.bill;
      t.electricityCovered += view.electricity.covered;
      t.electricityDue += view.electricity.balance;
    }
    for (const key of Object.keys(t) as (keyof SummaryTrendMonth)[]) if (key !== "month") t[key] = cents(t[key] as number);
    return t;
  });

  const rent = { expected: 0, collected: 0, outstanding: 0, counts: { paid: 0, partial: 0, unpaid: 0 } };
  const electricity = { billed: 0, covered: 0, due: 0, readingsEntered: 0, readingsExpected: 0, counts: { paid: 0, partial: 0, unpaid: 0, none: 0 } };
  const topDue: SummaryResponse["topDue"] = [];
  let applicable = 0;
  for (const unit of occupied) {
    const view = viewOf(unit, month);
    if (view.applicable) {
      applicable++;
      rent.expected += view.rent.due;
      rent.collected += view.rent.received;
      rent.outstanding += view.rent.balance;
      if (view.rent.status === "PAID") rent.counts.paid++;
      else if (view.rent.status === "PARTIAL") rent.counts.partial++;
      else rent.counts.unpaid++;
    }
    // Electricity applies from the month the tenant moves in (a meter can be read before rent starts).
    if (!isBeforeMoveInMonth(unit.moveInDate, month)) {
      electricity.readingsExpected++;
      if (view.electricity.hasReading) electricity.readingsEntered++;
      electricity.billed += view.electricity.bill;
      electricity.covered += view.electricity.covered;
      electricity.due += view.electricity.balance;
      if (view.electricity.status === "PAID") electricity.counts.paid++;
      else if (view.electricity.status === "PARTIAL") electricity.counts.partial++;
      else if (view.electricity.status === "UNPAID") electricity.counts.unpaid++;
      else electricity.counts.none++;
    }
    const rentDue = view.rent.balance;
    const electricityDue = view.electricity.balance;
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
      outstanding: cents(rent.outstanding),
      collectedPct: rent.expected > 0 ? Math.min(100, Math.round((rent.collected / rent.expected) * 100)) : 0,
      counts: rent.counts,
    },
    electricity: {
      billed: cents(electricity.billed),
      covered: cents(electricity.covered),
      due: cents(electricity.due),
      readingsEntered: electricity.readingsEntered,
      readingsExpected: electricity.readingsExpected,
      counts: electricity.counts,
      formula: describeFormula(config, month),
    },
    trend,
    topDue: topDue.slice(0, 6),
  };
}
