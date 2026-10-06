import { dbPrefix, deleteDocument, listDocuments, setDocument, getDocument, type FirebaseValue } from "../src/lib/firebase";

// Moves every payment record of one month to another, e.g. `npm run db:move-month -- 2026-06 2026-07`.
// Add --keep to copy instead of move (the source month is left in place). Existing records in the
// target month are skipped unless --force is passed. Requires FIREBASE_DB_PREFIX so it can only run
// against a test copy, never live data.
async function main() {
  const args = process.argv.slice(2);
  const [from, to] = args.filter((arg) => !arg.startsWith("--"));
  const keep = args.includes("--keep"), force = args.includes("--force");
  const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!from || !to || !monthPattern.test(from) || !monthPattern.test(to) || from === to) {
    throw new Error("Usage: npm run db:move-month -- <YYYY-MM> <YYYY-MM> [--keep] [--force]");
  }
  const prefix = dbPrefix();
  if (!prefix) throw new Error("Set FIREBASE_DB_PREFIX (e.g. test) first - this script only runs against a test copy.");

  const payments = (await listDocuments<Record<string, FirebaseValue>>("payments")).filter((p) => p.month === from);
  let moved = 0, skipped = 0;
  for (const { id, ...data } of payments) {
    const unitId = data.unitId as string;
    const targetId = `${unitId}_${to}`;
    if (!force && (await getDocument(`payments/${targetId}`))) { skipped++; continue; }
    await setDocument(`payments/${targetId}`, { ...data, month: to, updatedAt: new Date() });
    if (!keep) await deleteDocument(`payments/${id}`);
    moved++;
  }
  console.log(`${keep ? "Copied" : "Moved"} ${moved} payment record(s) ${from} -> ${to} under /${prefix}/payments; skipped ${skipped} already in ${to}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
