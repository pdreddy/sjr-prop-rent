import { dbPrefix, rawRequest } from "../src/lib/firebase";

// Shows which database path the app and scripts use: `npm run db:where`.
async function main() {
  const prefix = dbPrefix();
  console.log(`FIREBASE_DATABASE_URL: ${process.env.FIREBASE_DATABASE_URL ?? "(derived from project id)"}`);
  console.log(`FIREBASE_DB_PREFIX:    ${prefix ? `"${prefix}"` : "(not set)"}`);
  console.log(prefix ? `=> reads/writes /${prefix}/units, /${prefix}/payments ... (TEST copy)` : "=> reads/writes /units, /payments ... (LIVE DATA)");
  const count = async (path: string) => { const r = await rawRequest(path, { headers: {} }); return r ? Object.keys(r).length : 0; };
  console.log(`live  /payments records: ${await count("payments")}`);
  if (prefix) console.log(`test  /${prefix}/payments records: ${await count(`${prefix}/payments`)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
