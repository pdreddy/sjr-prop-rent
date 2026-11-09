import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ELECTRICITY_CONFIG, formulaForMonth, normalizeElectricityConfig, parseSchedule, scheduleToStored } from "../../src/lib/config";
import { computeElectricityAmount, electricityBreakdown } from "../../src/lib/electricity";
import { buildElectricityLedger } from "../../src/lib/electricityLedger";

const cfg = DEFAULT_ELECTRICITY_CONFIG;
const bill = (units: number, month: string, config = cfg) => computeElectricityAmount(100, 100 + units, config, "999", month);

test("default schedule: flat through 2026-10, slab from 2026-11", () => {
  assert.equal(formulaForMonth(cfg, "2026-10"), "flat");
  assert.equal(formulaForMonth(cfg, "2026-11"), "slab");
  assert.equal(formulaForMonth(cfg, "1999-05"), "flat"); // before the first row
  assert.equal(bill(100, "2026-10"), 700);
  assert.equal(bill(100, "2026-11"), 750);
  assert.equal(bill(201, "2026-11"), 1510);
  assert.equal(bill(400, "2026-11"), 3500);
});

test("electricity-board bill is reproduced", () => {
  const profile = { slabLimit: 0, ratePerUnit: 10.5, rateAboveLimit: 10.5, fppcaPerUnit: 0.2, surchargePerUnit: 0.35, taxPercent: 9, fixedCharge: 3400 };
  assert.equal(electricityBreakdown(2061, profile).total, 28122);
});

test("fixed charge needs a reading", () => {
  const profile = { ...cfg.formulas.slab, fixedCharge: 50 };
  assert.equal(electricityBreakdown(0, profile, { hasReading: false }).total, 0);
  assert.equal(electricityBreakdown(0, profile, { hasReading: true }).total, 50);
});

test("changing a profile only affects months assigned to it", () => {
  const changed = normalizeElectricityConfig({ ...cfg, formulas: { flat: { ...cfg.formulas.flat }, slab: { ...cfg.formulas.slab, ratePerUnit: 9 } } });
  assert.equal(bill(100, "2026-10", changed), 700);
  assert.equal(bill(100, "2026-11", changed), 900);
});

test("a month with no reading still bills the flat default", () => {
  assert.equal(computeElectricityAmount(100, 0, cfg, "101", "2026-11"), cfg.defaultHigh);
  assert.equal(computeElectricityAmount(100, 0, cfg, "102", "2026-11"), cfg.defaultStandard);
});

test("legacy document (only ratePerUnit) prices every month flat", () => {
  const legacy = normalizeElectricityConfig({ ratePerUnit: 7 });
  assert.equal(legacy.formulas.flat.ratePerUnit, 7);
  assert.deepEqual(legacy.formulas.slab, cfg.formulas.slab);
  assert.deepEqual(legacy.schedule, cfg.schedule);
  assert.equal(bill(100, "2026-10", legacy), 700);
  // ...until a schedule row is added: with only the flat row, November stays flat.
  const flatOnly = normalizeElectricityConfig({ ratePerUnit: 7, schedule: { "2000-01": "flat" } });
  assert.equal(bill(100, "2027-03", flatOnly), 700);
  assert.equal(normalizeElectricityConfig({ ratePerUnit: 8 }).formulas.flat.ratePerUnit, 8);
});

test("bare number input is a flat rate for every month", () => {
  assert.equal(computeElectricityAmount(0, 100, 7, "1", "2030-01"), 700);
});

test("schedule survives the database round trip and bad input", () => {
  const stored = scheduleToStored(cfg.schedule);
  assert.deepEqual(parseSchedule(stored), cfg.schedule);
  assert.deepEqual(parseSchedule({ "0": { fromMonth: "2026-11", formula: "slab" }, "1": { fromMonth: "2000-01", formula: "flat" } }), cfg.schedule);
  assert.deepEqual(parseSchedule("2026-11=slab, bogus=flat, 2000-01=flat, 2000-01=slab"), cfg.schedule);
  assert.deepEqual(normalizeElectricityConfig({ schedule: {} }).schedule, cfg.schedule);
});

test("ledger prices each month with its own formula", () => {
  const rows = ["2026-10", "2026-11"].map((month) => ({ month, rentAmount: 0, maintenanceAmount: 0, amountPaid: 0, prevReading: 0, currReading: 100 }));
  assert.deepEqual(buildElectricityLedger(rows, cfg, "999").map((e) => e.bill), [700, 750]);
});
