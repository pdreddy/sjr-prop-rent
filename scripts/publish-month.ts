import { dbPrefix, rawRequest } from "../src/lib/firebase";

// Copies ONE month's records from the test copy (/<FIREBASE_DB_PREFIX>/...) into the live data:
//   npm run db:publish-month -- 2026-11            (shows what would be copied, changes nothing)
//   npm run db:publish-month -- 2026-11 --apply    (copies)
// Use it when a month was entered while the app was pointed at the test copy. It only ever ADDS:
// a record that already exists in the live data is left untouched, nothing is deleted, and other
// months are not read. Records for a plot that does not exist in the live data are skipped.
type Records = Record<string, { unitId?: string; month?: string; amountPaid?: number; currReading?: number }> | null;

async function main() {
  const args = process.argv.slice(2);
  const month = args.find((arg) => !arg.startsWith("--"));
  const apply = args.includes("--apply");
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Usage: npm run db:publish-month -- <YYYY-MM> [--apply]");
  const prefix = dbPrefix();
  if (!prefix) throw new Error("Set FIREBASE_DB_PREFIX (e.g. test) first: it names the test copy to copy the month from.");

  const [testPayments, livePayments, liveUnits, testBill, liveBill] = await Promise.all([
    rawRequest(`${prefix}/payments`) as Promise<Records>,
    rawRequest("payments") as Promise<Records>,
    rawRequest("units") as Promise<Record<string, { plotNumber?: string; tenantName?: string | null }> | null>,
    rawRequest(`${prefix}/buildingBills/${month}`),
    rawRequest(`buildingBills/${month}`),
  ]);
  // Records are keyed `<unitId>_<YYYY-MM>`; fall back to the key when the month field is missing.
  const inMonth = Object.entries(testPayments ?? {}).filter(([id, p]) => (p.month ?? id.split("_").pop()) === month);
  console.log(`${apply ? "COPYING" : "DRY RUN (nothing is changed)"}: ${month} from /${prefix}/payments to the live /payments`);
  console.log(`Test copy has ${inMonth.length} record(s) for ${month}; live has ${Object.keys(livePayments ?? {}).filter((id) => id.endsWith(`_${month}`)).length}.\n`);

  let copied = 0, existing = 0, noPlot = 0;
  for (const [id, record] of inMonth) {
    const unitId = record.unitId ?? id.slice(0, -(month.length + 1));
    const unit = liveUnits?.[unitId];
    const label = unit ? `Plot ${unit.plotNumber ?? "?"} (${unit.tenantName?.trim() || "vacant"})` : `unit ${unitId}`;
    const detail = `paid ₹${record.amountPaid ?? 0}, reading ${record.currReading ?? 0}`;
    if (!unit) { noPlot++; console.log(`  skip   ${label}: this plot does not exist in the live data`); continue; }
    if (livePayments?.[id]) { existing++; console.log(`  keep   ${label}: live already has a ${month} record - left as it is`); continue; }
    copied++;
    console.log(`  ${apply ? "copied" : "copy  "} ${label}: ${detail}`);
    if (apply) await rawRequest(`payments/${id}`, { method: "PUT", body: JSON.stringify(record) });
  }
  if (testBill && !liveBill) {
    console.log(`  ${apply ? "copied" : "copy  "} building's power bill for ${month}`);
    if (apply) await rawRequest(`buildingBills/${month}`, { method: "PUT", body: JSON.stringify(testBill) });
  }
  console.log(`\n${apply ? "Copied" : "Would copy"} ${copied}; ${existing} already in live (untouched); ${noPlot} skipped (no such plot in live).`);
  if (!apply && copied > 0) console.log(`Run again with --apply to copy:  npm run db:publish-month -- ${month} --apply`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
