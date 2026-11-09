import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ELECTRICITY_CONFIG } from "../../src/lib/config";
import { buildLedgers, buildUnitMonthView } from "../../src/lib/monthView";
import { buildSummary } from "../../src/lib/summary";
import { publicRentMonths } from "../../src/lib/publicRentHistory";
import type { LedgerRecord } from "../../src/lib/paymentHistory";

// Moved in on the 16th: the first rent record (August) is 15 of 30 days = 5,000 + 500.
const unit = { id: "u", plotNumber: "102", tenantName: "Asha", active: true, monthlyRent: 10000, maintenanceAmount: 1000, moveInDate: new Date("2026-07-16T00:00:00Z") };
const record = (month: string, rent: number, maint: number, paid: number, status: LedgerRecord["paymentStatus"], prev: number, curr: number): LedgerRecord => ({
  unitId: "u", month, rentAmount: rent, maintenanceAmount: maint, amountPaid: paid, paymentStatus: status, prevReading: prev, currReading: curr, electricityPaid: false,
});
const payments = [
  record("2026-08", 5000, 500, 11000, "PAID", 0, 0), // a full month paid on a part month: 5,500 is rent paid ahead
  record("2026-09", 10000, 1000, 5500, "PARTIAL", 0, 100), // the record alone says partial; with the advance it is paid
  record("2026-10", 10000, 1000, 11500, "PAID", 100, 150), // 500 over rent pays the 350 electricity bill
];
const config = DEFAULT_ELECTRICITY_CONFIG;
const ledger = buildLedgers([unit], payments, config, "2026-11").get("u")!;
const view = (month: string) => buildUnitMonthView(unit, ledger, payments.find((p) => p.month === month), month);

test("a month covered by rent paid ahead is paid, with no balance", () => {
  const september = view("2026-09");
  assert.equal(september.rent.status, "PAID");
  assert.equal(september.rent.balance, 0);
  assert.equal(september.rent.due, 11000);
});

test("electricity paid through a small excess over rent counts as paid without the manual flag", () => {
  const october = view("2026-10");
  assert.deepEqual([october.electricity.status, october.electricity.bill, october.electricity.covered, october.electricity.balance], ["PAID", 350, 350, 0]);
  const september = view("2026-09");
  assert.deepEqual([september.electricity.status, september.electricity.bill, september.electricity.balance], ["UNPAID", 700, 700]);
});

test("a month without a record owes rent but has no electricity bill yet", () => {
  const november = view("2026-11");
  assert.deepEqual([november.rent.status, november.rent.due, november.rent.balance], ["UNPAID", 11000, 11000]);
  assert.deepEqual([november.electricity.status, november.electricity.bill], ["NA", 0]);
  assert.equal(november.electricity.outstandingTotal, ledger.totals.electricityBalance);
});

test("nothing applies before the tenant moves in, or on a vacant plot", () => {
  assert.equal(view("2026-06").applicable, false);
  assert.equal(view("2026-07").rent.status, "NA"); // move-in month: rent starts the month after
  const vacant = buildUnitMonthView({ ...unit, tenantName: null }, undefined, undefined, "2026-10");
  assert.deepEqual([vacant.isVacant, vacant.rent.status, vacant.electricity.status], [true, "NA", "NA"]);
});

test("the month view, the summary and the public history all read the same ledger", () => {
  const summary = buildSummary([unit], payments, config, "2026-09");
  assert.deepEqual(summary.rent.counts, { paid: 1, partial: 0, unpaid: 0 });
  assert.equal(summary.rent.outstanding, view("2026-09").rent.balance);
  assert.equal(summary.electricity.due, view("2026-09").electricity.balance);
  assert.equal(summary.trend.at(-1)?.electricityDue, summary.electricity.due);
  const publicStatus = publicRentMonths(ledger).find((m) => m.month === "2026-09")?.status;
  assert.equal(publicStatus, view("2026-09").rent.status);
});
