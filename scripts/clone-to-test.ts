import { dbPrefix, rawRequest } from "../src/lib/firebase";

// Copies the live collections (database root) into /<FIREBASE_DB_PREFIX>/ so the app can run
// against a throwaway copy of production data. Only ever writes under the prefix.
const COLLECTIONS = ["admins", "units", "payments", "settings", "auditLogs"];

async function main() {
  const prefix = dbPrefix();
  if (!prefix) throw new Error("Set FIREBASE_DB_PREFIX (e.g. test) first - refusing to copy live data onto itself.");
  if (COLLECTIONS.includes(prefix)) throw new Error(`FIREBASE_DB_PREFIX "${prefix}" collides with a live collection.`);

  for (const name of COLLECTIONS) {
    const data = await rawRequest(name);
    await rawRequest(`${prefix}/${name}`, { method: "PUT", body: JSON.stringify(data) });
    console.log(`${name}: ${data ? Object.keys(data).length : 0} records -> ${prefix}/${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
