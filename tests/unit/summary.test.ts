import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ELECTRICITY_CONFIG } from "../../src/lib/config";
import { buildSummary, type SummaryPayment, type SummaryUnit } from "../../src/lib/summary";

const unit = (id: string, plot: string, name: string | null, moveIn: string | null): SummaryUnit => ({
  id, plotNumber: plot, tenantName: name, active: true, monthlyRent: 20000, maintenanceAmount: 1000, moveInDate: moveIn ? new Date(`${moveIn}T00:00:00Z`) : null,
});
const pay = (unitId: string, month: string, paid: number, prev: number, curr: number, status: SummaryPayment["paymentStatus"]): SummaryPayment => ({
  unitId, month, rentAmount: 20000, maintenanceAmount: 1000, amountPaid: paid, paymentStatus: status, prevReading: prev, currReading: curr, electricityPaid: false,
});

const units = [unit("a", "101", "Ravi", "2026-05-01"), unit("b", "102", "Anita", "2026-05-01"), unit("c", "103", null, null)];
const payments = [
  pay("a", "2026-10", 21000, 100, 200, "PAID"), // 100 units flat = 700 electricity, unpaid
  pay("b", "2026-10", 10000, 50, 50, "PARTIAL"),
  pay("a", "2026-09", 21000, 0, 100, "PAID"),
  pay("b", "2026-09", 21000, 0, 50, "PAID"),
];

test("month summary rolls up rent, electricity and plots", () => {
  const s = buildSummary(units, payments, DEFAULT_ELECTRICITY_CONFIG, "2026-10");
  assert.deepEqual(s.plots, { total: 3, occupied: 2, vacant: 1, notStarted: 0, applicable: 2 });
  assert.equal(s.rent.expected, 42000);
  assert.equal(s.rent.collected, 31000);
  assert.equal(s.rent.outstanding, 11000);
  assert.equal(s.rent.collectedPct, 74);
  assert.deepEqual(s.rent.counts, { paid: 1, partial: 1, unpaid: 0 });
  assert.equal(s.electricity.billed, 700); // 100 units at the flat rate; plot 102 read 0 units
  assert.equal(s.electricity.due, 700);
  assert.equal(s.electricity.readingsEntered, 2);
  assert.deepEqual(s.topDue.map((r) => [r.plotNumber, r.total]), [["101", 700], ["102", 11000]].sort((x, y) => (y[1] as number) - (x[1] as number)));
});

test("trend is oldest-first and ends on the selected month", () => {
  const s = buildSummary(units, payments, DEFAULT_ELECTRICITY_CONFIG, "2026-10");
  assert.equal(s.trend.at(-1)?.month, "2026-10");
  assert.deepEqual(s.trend.map((t) => t.month), [...s.trend.map((t) => t.month)].sort());
  const sept = s.trend.find((t) => t.month === "2026-09");
  assert.equal(sept?.rentCollected, 42000);
});

test("tenants who have not started rent yet are left out", () => {
  const s = buildSummary([...units, unit("d", "104", "New", "2026-10-15")], payments, DEFAULT_ELECTRICITY_CONFIG, "2026-10");
  assert.equal(s.plots.applicable, 2);
  assert.equal(s.plots.notStarted, 1);
});
