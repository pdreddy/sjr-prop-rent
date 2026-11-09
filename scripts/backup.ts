import { mkdirSync, writeFileSync } from "node:fs";
import { dbPrefix, rawRequest } from "../src/lib/firebase";

// Exports every collection to a JSON file: `npm run db:backup [-- <file>] [--test]`.
// Reads the live data at the database root by default; --test reads the FIREBASE_DB_PREFIX copy.
// Values are saved exactly as stored (dates included), so db:restore reproduces them faithfully.
const COLLECTIONS = ["admins", "units", "payments", "settings", "auditLogs"];

async function main() {
  const args = process.argv.slice(2);
  const fromTest = args.includes("--test");
  const prefix = dbPrefix();
  if (fromTest && !prefix) throw new Error("--test needs FIREBASE_DB_PREFIX to be set.");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = args.find((arg) => !arg.startsWith("--")) ?? `backups/${fromTest ? prefix : "live"}-${stamp}.json`;

  const data: Record<string, unknown> = {};
  for (const name of COLLECTIONS) {
    data[name] = await rawRequest(fromTest ? `${prefix}/${name}` : name);
    console.log(`${name}: ${data[name] ? Object.keys(data[name] as object).length : 0} records`);
  }
  mkdirSync(file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ".", { recursive: true });
  writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), source: fromTest ? prefix : "live", data }, null, 2));
  console.log(`Saved ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
