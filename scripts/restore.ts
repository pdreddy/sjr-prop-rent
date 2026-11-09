import { readFileSync } from "node:fs";
import { dbPrefix, rawRequest } from "../src/lib/firebase";

// Imports a db:backup file into the FIREBASE_DB_PREFIX copy: `npm run db:restore -- <file>`.
// Replaces each collection under /<prefix>/ with the file's contents. Never writes to live data.
const COLLECTIONS = ["admins", "units", "payments", "settings", "auditLogs"];

async function main() {
  const file = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!file) throw new Error("Usage: npm run db:restore -- <backup-file.json>");
  const prefix = dbPrefix();
  if (!prefix) throw new Error("Set FIREBASE_DB_PREFIX (e.g. test) first - refusing to overwrite live data.");
  if (COLLECTIONS.includes(prefix)) throw new Error(`FIREBASE_DB_PREFIX "${prefix}" collides with a live collection.`);

  const { data } = JSON.parse(readFileSync(file, "utf8")) as { data?: Record<string, unknown> };
  if (!data) throw new Error("Not a db:backup file (missing \"data\").");
  for (const name of COLLECTIONS) {
    const records = data[name] ?? null;
    await rawRequest(`${prefix}/${name}`, { method: "PUT", body: JSON.stringify(records) });
    console.log(`${name}: ${records ? Object.keys(records).length : 0} records -> ${prefix}/${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
