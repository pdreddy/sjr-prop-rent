import { backfillMonths } from "../src/lib/backfillMonths";
import { dbPrefix } from "../src/lib/firebase";

// Repairs rent records in the test copy: `npm run db:fix-months` previews, add --apply to write.
// Fills missing months from each tenant's first rent month (the month after move-in) to now,
// re-prices an unpaid first record to the prorated move-in rent, and deletes completely empty
// records dated before the first rent month. Records with a payment or meter reading are never
// changed - they are listed for review instead. Requires FIREBASE_DB_PREFIX (test copy only).
async function main() {
  const prefix = dbPrefix();
  if (!prefix) throw new Error("Set FIREBASE_DB_PREFIX (e.g. test) first - this only runs against a test copy.");
  const apply = process.argv.includes("--apply");
  const result = await backfillMonths({ dryRun: !apply, removeEmpty: true, updatedBy: "fix-months" });
  console.log(`${apply ? "Applied" : "Preview (nothing written)"} on /${prefix}:`);
  console.log(`  missing months created:        ${result.created}`);
  console.log(`  first records re-priced:       ${result.adjusted}`);
  console.log(`  empty early records removed:   ${result.removed}`);
  console.log(`  first records with payments at full rent (review): ${result.needsReview}`);
  for (const note of result.notes) console.log(`  ! ${note}`);
  if (!apply) console.log("Run again with --apply to write these changes.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
