import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPublicRentHistory } from "../../src/lib/publicRentHistory";
import { DEFAULT_ELECTRICITY_CONFIG } from "../../src/lib/config";

const date = new Date("2026-07-01T00:00:00Z");
const unit: Parameters<typeof buildPublicRentHistory>[0] = {
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
  assert.deepEqual(result.rentTotals, { billed: 33000, paid: 16000, due: 17000, advance: 0 });
  assert.deepEqual(result.rentMonths.map(m => m.status), ["PAID", "PARTIAL", "UNPAID"]);
  assert.equal(result.rentMonths[2].recorded, false);
  assert.equal(result.rentMonths[2].paidDate, null);
  assert.doesNotMatch(JSON.stringify(result), /private|Private|notes|unitId|tenantName|updatedBy/);
});

test("large rent advances cover later months and first rent is prorated", () => {
  const result = buildPublicRentHistory(unit, [payment("2026-08", 22000)], DEFAULT_ELECTRICITY_CONFIG, "2026-09");
  assert.deepEqual(result.rentTotals, { billed: 22000, paid: 22000, due: 0, advance: 0 });
  assert.equal(result.rentMonths[0].advance, 11000);
  assert.equal(result.rentMonths[1].status, "PAID");
  const prorated = buildPublicRentHistory({ ...unit, moveInDate: new Date("2026-07-16T00:00:00Z") }, [], DEFAULT_ELECTRICITY_CONFIG, "2026-08");
  assert.equal(prorated.rentMonths[0].bill, 5500);
});

test("vacant and future tenants have no rent history; unknown move-in dates do not invent bills", () => {
  for (const tenant of [{ ...unit, tenantName: null }, { ...unit, moveInDate: new Date("2027-01-01T00:00:00Z") }]) {
    assert.deepEqual(buildPublicRentHistory(tenant, [], DEFAULT_ELECTRICITY_CONFIG, "2026-10").rentMonths, []);
  }
  const unknown = buildPublicRentHistory({ ...unit, moveInDate: null }, [payment("2026-08", 11000)], DEFAULT_ELECTRICITY_CONFIG, "2026-10");
  assert.equal(unknown.rentMonths.length, 1);
  assert.equal(unknown.rentMonths[0].status, "NA");
  assert.equal(unknown.rentTotals.billed, 0);
});
