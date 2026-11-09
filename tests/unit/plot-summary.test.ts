import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ELECTRICITY_CONFIG } from "../../src/lib/config";
import { buildPaymentHistory, type LedgerRecord } from "../../src/lib/paymentHistory";
import { buildPlotSummary } from "../../src/lib/plotSummary";
import { buildPlotMessage, suggestedMessage, whatsappNumber } from "../../src/lib/plotMessages";

const unit = { id: "u", plotNumber: "101", tenantName: "Ravi Kumar", monthlyRent: 20000, maintenanceAmount: 1000, moveInDate: new Date("2026-07-01T00:00:00Z") };
const record = (month: string, paid: number, paidOn: string | null, prev = 0, curr = 0): LedgerRecord => ({
  unitId: "u", month, rentAmount: 20000, maintenanceAmount: 1000, amountPaid: paid, paymentStatus: paid >= 21000 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID",
  paidDate: paidOn ? new Date(`${paidOn}T00:00:00Z`) : null, prevReading: prev, currReading: curr, electricityPaid: false,
});
const now = new Date("2026-11-20T00:00:00Z");
const summarise = (records: LedgerRecord[]) => buildPlotSummary(buildPaymentHistory(unit, records, DEFAULT_ELECTRICITY_CONFIG, "2026-11"), now);
const ctx = { tenantName: "Ravi Kumar", plotNumber: "101", buildingName: "SJR Building" };

test("a tenant who pays every month by the 7th is rated on time and gets a thank-you", () => {
  // Electricity is marked paid too, so nothing at all is owed.
  const s = summarise([record("2026-08", 21000, "2026-08-05"), record("2026-09", 21000, "2026-09-04"), record("2026-10", 21000, "2026-10-06"), record("2026-11", 21000, "2026-11-05")].map((r) => ({ ...r, electricityPaid: true })));
  assert.equal(s.rating, "good");
  assert.equal(s.title, "Pays on time");
  assert.deepEqual(s.months, { billed: 4, paidInFull: 4, partial: 0, overdue: 0, dueNow: 0 });
  assert.deepEqual([s.timing.onTime, s.timing.late, s.timing.usualDay], [4, 0, 5]);
  assert.equal(s.rent.balance, 0);
  assert.match(s.text, /4 of 4 months paid in full/);
  assert.equal(suggestedMessage(s), "thanks");
  assert.match(buildPlotMessage("thanks", { ...ctx, summary: s }), /Thank you for paying the rent for Plot 101\. You have paid on time for 4 months/);
});

test("late payments are counted against the 7th and listed", () => {
  const s = summarise([record("2026-08", 21000, "2026-08-20"), record("2026-09", 21000, "2026-09-18"), record("2026-10", 21000, "2026-10-05"), record("2026-11", 21000, "2026-11-19")]);
  assert.deepEqual([s.timing.onTime, s.timing.late, s.timing.avgDaysLate], [1, 3, 12]);
  assert.equal(s.title, "Usually pays late");
  assert.ok(s.notes.some((n) => n.tone === "warn" && /Aug 2026: paid 13 days late/.test(n.text)));
});

test("two unpaid months make a warning that lists the months and the totals", () => {
  const s = summarise([record("2026-08", 21000, "2026-08-05", 100, 200), record("2026-09", 0, null), record("2026-10", 5000, "2026-10-09"), record("2026-11", 0, null)]);
  assert.equal(s.rating, "poor");
  assert.equal(s.months.overdue, 3);
  assert.equal(s.rent.balance, 58000);
  assert.deepEqual(s.pendingMonths.map((m) => m.month), ["2026-09", "2026-10", "2026-11"]);
  assert.equal(s.lastPayment?.amount, 5000);
  assert.equal(suggestedMessage(s), "warning");
  const message = buildPlotMessage("warning", { ...ctx, summary: s });
  assert.match(message, /overdue for 3 months/);
  assert.match(message, /Rent: ₹58,000 \(Sep 2026, Oct 2026, Nov 2026\)/);
  assert.match(message, /Electricity: ₹/);
  assert.match(message, /- SJR Building$/);
});

test("a month still inside its first week is due, not overdue, and prompts a reminder", () => {
  const early = buildPlotSummary(buildPaymentHistory(unit, [record("2026-08", 21000, "2026-08-05"), record("2026-09", 21000, "2026-09-05"), record("2026-10", 21000, "2026-10-05")], DEFAULT_ELECTRICITY_CONFIG, "2026-11"), new Date("2026-11-03T00:00:00Z"));
  assert.deepEqual([early.months.overdue, early.months.dueNow, early.rating], [0, 1, "good"]);
  assert.equal(suggestedMessage(early), "reminder");
  assert.match(buildPlotMessage("reminder", { ...ctx, summary: early }), /gentle reminder[\s\S]*Rent: ₹21,000 \(Nov 2026\)/);
});

test("phone numbers become WhatsApp numbers with the country code", () => {
  assert.equal(whatsappNumber("98765 43210"), "919876543210");
  assert.equal(whatsappNumber("+91 98765-43210"), "919876543210");
  assert.equal(whatsappNumber("09876543210"), "919876543210");
});
