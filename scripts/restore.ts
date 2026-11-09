import { readFileSync } from "node:fs";
import { dbPrefix, rawRequest } from "../src/lib/firebase";

// Imports a db:backup file into the FIREBASE_DB_PREFIX copy: `npm run db:restore -- <file>`.
// Replaces each collection under /<prefix>/ with the file's contents. It only writes to live data when
// asked twice:  npm run db:restore -- <file> --to-live --yes   (rolls live back to that backup).
const COLLECTIONS = ["admins", "units", "payments", "settings", "buildingBills", "auditLogs"];

async function main() {
  const file = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!file) throw new Error("Usage: npm run db:restore -- <backup-file.json>");
  const args = process.argv.slice(2);
  const toLive = args.includes("--to-live");
  if (toLive && !args.includes("--yes")) throw new Error("--to-live replaces the LIVE data with this backup. Add --yes to confirm.");
  const prefix = toLive ? "" : dbPrefix();
  if (!toLive && !prefix) throw new Error("Set FIREBASE_DB_PREFIX (e.g. test) first, or pass --to-live --yes to roll the live data back to this backup.");
  if (COLLECTIONS.includes(prefix)) throw new Error(`FIREBASE_DB_PREFIX "${prefix}" collides with a live collection.`);

  const { data } = JSON.parse(readFileSync(file, "utf8")) as { data?: Record<string, unknown> };
  if (!data) throw new Error("Not a db:backup file (missing \"data\").");
  for (const name of COLLECTIONS) {
    const records = data[name] ?? null;
    // A backup made before a collection existed has no entry for it: leave that collection alone.
    if (!(name in data)) continue;
    const target = prefix ? `${prefix}/${name}` : name;
    await rawRequest(target, { method: "PUT", body: JSON.stringify(records) });
    console.log(`${name}: ${records ? Object.keys(records).length : 0} records -> ${toLive ? "LIVE " : ""}${target}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
