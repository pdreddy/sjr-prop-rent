import { mkdirSync, writeFileSync } from "node:fs";
import { backfillMonths } from "../src/lib/backfillMonths";
import { dbPrefix, rawRequest } from "../src/lib/firebase";
import { allUnits } from "../src/lib/store";
import { isBeforeBuildingOpened } from "../src/lib/month";

// Everything in one run, against the test copy only: `npm run db:repair` (add --preview to change nothing).
//   1. backs up /<prefix> to backups/ (skipped in preview)
//   2. lists tenants with a missing / impossible move-in date (their months are skipped, not guessed)
//   3. fills missing months from each tenant's first rent month (month after move-in), re-prices unpaid
//      part-month first records, moves payments filed before the first rent month into it, and removes
//      empty records dated before it
// Records with payments or meter readings are never deleted. Needs FIREBASE_DB_PREFIX (e.g. test).
const COLLECTIONS = ["admins", "units", "payments", "settings", "auditLogs"];

async function main() {
  const prefix = dbPrefix();
  if (!prefix) throw new Error("Set FIREBASE_DB_PREFIX (e.g. test) first - this only runs against a test copy.");
  const preview = process.argv.includes("--preview");

  if (!preview) {
    const data: Record<string, unknown> = {};
    for (const name of COLLECTIONS) data[name] = await rawRequest(`${prefix}/${name}`);
    const file = `backups/${prefix}-before-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    mkdirSync("backups", { recursive: true });
    writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), source: prefix, data }, null, 2));
    console.log(`1. Backup saved: ${file}  (restore with: npm run db:restore -- ${file})`);
  } else console.log("1. Preview mode - no backup needed, nothing will be written.");

  const tenants = (await allUnits()).filter((u) => u.active && u.tenantName?.trim());
  const noDate = tenants.filter((u) => !u.moveInDate);
  const badDate = tenants.filter((u) => u.moveInDate && isBeforeBuildingOpened(u.moveInDate));
  console.log(`2. ${tenants.length} tenants checked: ${noDate.length} without a move-in date, ${badDate.length} with a date before the building opened.`);
  for (const u of noDate) console.log(`   ! Plot ${u.plotNumber} (${u.tenantName}): no move-in date`);
  for (const u of badDate) console.log(`   ! Plot ${u.plotNumber} (${u.tenantName}): ${u.moveInDate!.toISOString().slice(0, 10)} - wrong year?`);

  const r = await backfillMonths({ dryRun: preview, removeEmpty: true, moveEarly: true, updatedBy: "repair-all" });
  console.log(`3. ${preview ? "Would do" : "Done"} on /${prefix}:`);
  console.log(`   early payments moved to first rent month: ${r.moved}`);
  console.log(`   missing months created:                   ${r.created}`);
  console.log(`   first records re-priced (part month):     ${r.adjusted}`);
  console.log(`   empty early records removed:              ${r.removed}`);
  if (r.needsReview) console.log(`   first records already paid at full rent (check by hand): ${r.needsReview}`);
  for (const note of r.notes) console.log(`   ! ${note}`);
  console.log(preview ? "Run `npm run db:repair` (no flag) to apply." : "Finished. Refresh the app; run `npm run db:repair` again any time - it is safe to repeat.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
