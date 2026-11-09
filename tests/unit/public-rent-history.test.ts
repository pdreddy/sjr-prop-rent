import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPaymentHistory } from "../../src/lib/paymentHistory";
import { buildPublicRentHistory } from "../../src/lib/publicRentHistory";
import { DEFAULT_ELECTRICITY_CONFIG } from "../../src/lib/config";

const date = new Date("2026-07-01T00:00:00Z");
const unit = {
  id: "tenant", plotNumber: "102", tenantName: "Private Name", moveInDate: date,
  monthlyRent: 10000, maintenanceAmount: 1000, active: true,
  phoneNumbers: ["private-phone"], advanceAmount: 0, advancePaid: 0,
  advancePaidDate: null, advanceNotes: "private-note", createdAt: date, updatedAt: date,
};
function payment(month: string, amountPaid: number, paymentStatus: "PAID" | "PARTIAL" = "PAID") {
  return {
    id: month, unitId: unit.id, month, amountPaid, paymentStatus,
    rentAmount: 10000, maintenanceAmount: 1000, balanceDue: 11000 - amountPaid,
    paidDate: date, notes: "private-note", prevReading: 0, currReading: 100,
    electricityAmount: 700, electricityPaid: false, updatedBy: "private-admin",
    createdAt: date, updatedAt: date,
  };
}

test("rent excludes electricity excess and includes missing months without exposing private data", () => {
  const result = buildPublicRentHistory(unit, [
    payment("2026-06", 11000), // previous tenant
    payment("2026-08", 11500), // 500 goes to electricity
    payment("2026-09", 5000, "PARTIAL"),
  ], DEFAULT_ELECTRICITY_CONFIG, "2026-10");
  assert.deepEqual(Object.keys(result), ["rentMonths"]);
  for (const month of result.rentMonths) assert.deepEqual(Object.keys(month).sort(), ["month", "status"]);
  assert.deepEqual(result.rentMonths.map(m => m.status), ["PAID", "PARTIAL", "UNPAID"]);

  assert.doesNotMatch(JSON.stringify(result), /private|Private|notes|unitId|tenantName|updatedBy/);
});

test("large rent advances cover later months and first rent is prorated", () => {
  const result = buildPublicRentHistory(unit, [payment("2026-08", 22000)], DEFAULT_ELECTRICITY_CONFIG, "2026-09");
  assert.equal(result.rentMonths[0].status, "PAID");
  assert.equal(result.rentMonths[1].status, "PAID");
  const prorated = buildPaymentHistory({ ...unit, moveInDate: new Date("2026-07-16T00:00:00Z") }, [], DEFAULT_ELECTRICITY_CONFIG, "2026-08");
  assert.equal(prorated.months[0].rentDue, 5500);
});

test("vacant and future tenants have no rent history; unknown move-in dates show only what was recorded", () => {
  for (const tenant of [{ ...unit, tenantName: null }, { ...unit, moveInDate: new Date("2027-01-01T00:00:00Z") }]) {
    assert.deepEqual(buildPublicRentHistory(tenant, [], DEFAULT_ELECTRICITY_CONFIG, "2026-10").rentMonths, []);
  }
  const unknown = buildPublicRentHistory({ ...unit, moveInDate: null }, [payment("2026-08", 11000)], DEFAULT_ELECTRICITY_CONFIG, "2026-10");
  assert.equal(unknown.rentMonths.length, 1);
  // Nothing is billed without a move-in date, but the recorded month keeps the status saved on it,
  // so the history row matches the month's own status on the page.
  assert.equal(unknown.rentMonths[0].status, "PAID");
  assert.deepEqual(Object.keys(unknown.rentMonths[0]).sort(), ["month", "status"]);
});
