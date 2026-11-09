import { mkdirSync, writeFileSync } from "node:fs";
import { dbPrefix, rawRequest } from "../src/lib/firebase";

// Brings the live data in line with the test copy (/<FIREBASE_DB_PREFIX>/...):
//   npm run db:sync-from-test                      compare only - changes nothing
//   npm run db:sync-from-test -- --apply           MERGE: add what only the test copy has, and where both
//                                                  have a record take the one saved most recently.
//                                                  Records only live has are kept.
//   npm run db:sync-from-test -- --apply --replace REPLACE: make live exactly match the test copy.
//                                                  Records only live has are DELETED.
// Before writing anything, --apply saves a full backup of the live data to backups/. Admin logins are
// never touched. Roll back with:  npm run db:restore -- <that file> --to-live --yes
type Doc = Record<string, unknown>;
type Collection = Record<string, Doc> | null;

const COLLECTIONS = ["units", "payments", "settings", "buildingBills", "auditLogs"] as const;
const BACKUP_COLLECTIONS = ["admins", ...COLLECTIONS];
// Fields worth showing when a record differs (everything is still copied).
const SHOWN = ["tenantName", "moveInDate", "monthlyRent", "maintenanceAmount", "active", "paymentStatus", "rentAmount", "amountPaid", "paidDate", "prevReading", "currReading", "electricityPaid", "amount"];
const BOOKKEEPING = new Set(["updatedAt", "updatedBy", "createdAt", "electricityAmount", "balanceDue"]);

const plain = (value: unknown): unknown => {
  const v = value as { __type?: string; value?: string } | null;
  return v && typeof v === "object" && v.__type === "date" ? String(v.value).slice(0, 10) : value;
};
const time = (doc: Doc | undefined) => {
  const raw = plain(doc?.updatedAt);
  const stamp = (doc?.updatedAt as { value?: string } | undefined)?.value ?? (typeof raw === "string" ? raw : "");
  return stamp ? new Date(stamp).getTime() || 0 : 0;
};
const meaningful = (doc: Doc) => JSON.stringify(Object.fromEntries(Object.entries(doc).filter(([k]) => !BOOKKEEPING.has(k)).sort(([a], [b]) => a.localeCompare(b))));

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply"), replace = args.includes("--replace");
  const prefix = dbPrefix();
  if (!prefix) throw new Error("Set FIREBASE_DB_PREFIX (e.g. test) first: it names the test copy to sync from.");
  if (replace && !apply) console.log("(--replace has no effect without --apply; showing the comparison.)\n");

  const live: Record<string, Collection> = {}, test: Record<string, Collection> = {};
  for (const name of BACKUP_COLLECTIONS) live[name] = (await rawRequest(name)) as Collection;
  for (const name of COLLECTIONS) test[name] = (await rawRequest(`${prefix}/${name}`)) as Collection;

  const units = { ...(live.units ?? {}), ...(test.units ?? {}) };
  const label = (collection: string, id: string) => {
    if (collection === "units") return `Plot ${units[id]?.plotNumber ?? id}`;
    if (collection === "payments") {
      const match = id.match(/^(.+)_(\d{4}-\d{2})$/);
      return match ? `Plot ${units[match[1]]?.plotNumber ?? "?"} ${match[2]}` : id;
    }
    return id;
  };

  const mode = !apply ? "COMPARE ONLY - nothing is changed" : replace ? "REPLACE - live will exactly match the test copy" : "MERGE - add and update, never delete";
  console.log(`${mode}\nTest copy: /${prefix}   ->   live data\n`);

  if (apply) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = `backups/live-before-sync-${stamp}.json`;
    mkdirSync("backups", { recursive: true });
    writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), source: "live", data: live }, null, 2));
    console.log(`Backup of the live data saved first: ${file}\n`);
  }

  const totals = { added: 0, updated: 0, keptLive: 0, deleted: 0, onlyLive: 0 };
  for (const name of COLLECTIONS) {
    const a = live[name] ?? {}, b = test[name] ?? {};
    const onlyTest = Object.keys(b).filter((id) => !(id in a));
    const onlyLive = Object.keys(a).filter((id) => !(id in b));
    const both = Object.keys(b).filter((id) => id in a && meaningful(a[id]) !== meaningful(b[id]));
    const same = Object.keys(b).length - onlyTest.length - both.length;
    console.log(`${name}: live ${Object.keys(a).length}, test ${Object.keys(b).length}  |  same ${same}, only in test ${onlyTest.length}, only in live ${onlyLive.length}, different ${both.length}`);

    // The activity log is a history: entries are only ever added, never changed or removed.
    const history = name === "auditLogs";
    const quiet = history;
    for (const id of onlyTest) {
      totals.added++;
      if (!quiet) console.log(`  + add     ${label(name, id)}`);
      if (apply) await rawRequest(`${name}/${id}`, { method: "PUT", body: JSON.stringify(b[id]) });
    }
    for (const id of both) {
      if (history) continue;
      const testNewer = time(b[id]) >= time(a[id]);
      const useTest = replace || testNewer;
      const changes = [...new Set([...SHOWN, ...Object.keys(a[id]), ...Object.keys(b[id])])]
        .filter((k) => !BOOKKEEPING.has(k) && JSON.stringify(a[id][k] ?? null) !== JSON.stringify(b[id][k] ?? null))
        .slice(0, 6)
        .map((k) => `${k}: ${JSON.stringify(plain(a[id][k]) ?? null)} -> ${JSON.stringify(plain(b[id][k]) ?? null)}`)
        .join(", ");
      if (useTest) totals.updated++; else totals.keptLive++;
      console.log(`  ${useTest ? "~ update " : "= keep   "} ${label(name, id)}: ${changes}${useTest ? "" : "   (live was saved more recently, so live is kept)"}`);
      if (apply && useTest) await rawRequest(`${name}/${id}`, { method: "PUT", body: JSON.stringify(b[id]) });
    }
    for (const id of onlyLive) {
      if (history) continue;
      totals.onlyLive++;
      if (replace) {
        totals.deleted++;
        console.log(`  - DELETE  ${label(name, id)} (not in the test copy)`);
        if (apply) await rawRequest(`${name}/${id}`, { method: "DELETE" });
      } else console.log(`  . only in live, kept: ${label(name, id)}`);
    }
  }

  console.log(`\n${apply ? "Done" : "Summary"}: ${totals.added} ${apply ? "added" : "to add"}, ${totals.updated} ${apply ? "updated" : "to update from the test copy"}, ${totals.keptLive} kept as live${apply && replace ? `, ${totals.deleted} deleted` : `, ${totals.onlyLive} only in live (${apply ? "kept" : "kept by a merge, deleted by --replace"})`}.`);
  if (!apply) {
    console.log(`\nNothing was changed. To go ahead:`);
    console.log(`  npm run db:sync-from-test -- --apply            merge (keeps records only live has)`);
    console.log(`  npm run db:sync-from-test -- --apply --replace  make live exactly match the test copy (deletes records only live has)`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
