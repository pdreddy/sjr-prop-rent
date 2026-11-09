import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateElectricity,
  RECEIPT_EXAMPLE,
  electricityInputSchema,
} from "../../src/lib/buildingElectricity";

test("matches every line of the original building bill, including tax and rounding", () => {
  const bill = calculateElectricity(RECEIPT_EXAMPLE);
  assert.deepEqual(bill, {
    units: 2061,
    fixed: 3400,
    energy: 21640.5,
    fppca: 412.2,
    surcharge: 721.35,
    taxable: 21640.5,
    tax: 1947.65,
    currentDemand: 28200.86,
    beforeRounding: 28200.86,
    roundingAdjustment: 0.14,
    netPayable: 28201,
    originalDifference: 0,
    collectionBalance: 28201,
  });
});

test("all rates, tax basis, adjustments and collections can change independently", () => {
  const bill = calculateElectricity({
    ...RECEIPT_EXAMPLE,
    previousReading: 100,
    currentReading: 110,
    meterConstant: 2,
    billedLoadKw: 2,
    fixedRate: 100,
    energyRate: 5,
    fppcaRate: 0.5,
    surchargeRate: 0.25,
    taxPercent: 10,
    taxableComponents: ["fixed", "energy", "fppca", "surcharge"],
    pfPenalty: 1,
    excessDemandPenalty: 2,
    interest: 3,
    arrears: 10,
    credits: 4,
    rounding: "NONE",
    originalBillAmount: 400,
    tenantCollected: 250,
  });
  assert.equal(bill.units, 20);
  assert.equal(bill.tax, 31.5);
  assert.equal(bill.currentDemand, 352.5);
  assert.equal(bill.netPayable, 358.5);
  assert.equal(bill.originalDifference, 41.5);
  assert.equal(bill.collectionBalance, 150);
});

test("rounding options and collections never change computed charges", () => {
  for (const [rounding, expected] of [
    ["NONE", 28200.86],
    ["DOWN_RUPEE", 28200],
    ["UP_RUPEE", 28201],
    ["NEAREST_RUPEE", 28201],
  ] as const) {
    const bill = calculateElectricity({
      ...RECEIPT_EXAMPLE,
      rounding,
      tenantCollected: 30000,
    });
    assert.equal(bill.netPayable, expected);
    assert.equal(bill.collectionBalance, -1799);
  }
});

test("invalid readings, negative charges, unsafe links and nonfinite values are rejected", () => {
  for (const patch of [
    { currentReading: 1 },
    { energyRate: -1 },
    { meterConstant: 0 },
    { tenantCollected: Infinity },
    { originalBillUrl: "javascript:alert(1)" },
    { taxPercent: 101 },
    { interest: 0.001 },
  ]) {
    assert.equal(
      electricityInputSchema.safeParse({ ...RECEIPT_EXAMPLE, ...patch })
        .success,
      false,
    );
  }
});

test("recorded demand is reference information, not the fixed-charge billing load", () => {
  assert.equal(
    calculateElectricity({
      ...RECEIPT_EXAMPLE,
      recordedDemandKw: 99,
      powerFactor: 0.8,
    }).fixed,
    3400,
  );
});
