import assert from "node:assert/strict";
import { test } from "node:test";
import { auditGroupOf, diffAudit, parsePaymentRecordId } from "../../src/lib/auditView";

test("an update lists only the fields that changed", () => {
  const changes = diffAudit(
    { rentAmount: 20000, amountPaid: 0, paymentStatus: "UNPAID", updatedAt: "a", electricityAmount: 0 },
    { rentAmount: 20000, amountPaid: 21000, paymentStatus: "PAID", updatedAt: "b", electricityAmount: 700 },
  );
  assert.deepEqual(changes.map((c) => [c.label, c.from, c.to]), [["Amount paid", 0, 21000], ["Rent status", "UNPAID", "PAID"]]);
});

test("a new record lists what was entered; a deletion lists what was removed", () => {
  const created = diffAudit(null, { rentAmount: 20000, amountPaid: 0, currReading: 150, notes: "", electricityPaid: false });
  assert.deepEqual(created.map((c) => c.label), ["Rent", "Current reading"]);
  assert.equal(created[0].from, null);
  const deleted = diffAudit({ rentAmount: 20000, notes: "late" }, null);
  assert.deepEqual(deleted.map((c) => [c.label, c.to]), [["Rent", null], ["Notes", null]]);
});

test("nested settings are flattened with a readable path", () => {
  const changes = diffAudit(
    { electricity: { formulas: { flat: { ratePerUnit: 7 } }, excessLimit: 1500 } },
    { electricity: { formulas: { flat: { ratePerUnit: 8 } }, excessLimit: 1500 } },
  );
  assert.deepEqual(changes, [{ label: "Electricity › Formulas › Flat formula › Rate per unit", key: "ratePerUnit", from: 7, to: 8 }]);
});

test("record ids and groups", () => {
  assert.deepEqual(parsePaymentRecordId("abc123_2026-10"), { unitId: "abc123", month: "2026-10" });
  assert.equal(parsePaymentRecordId("abc123"), null);
  assert.equal(auditGroupOf("MoveInPayment"), "Payment");
  assert.equal(auditGroupOf("Admin"), "Other");
});
