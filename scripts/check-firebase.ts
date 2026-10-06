// Diagnoses Firebase connection problems without printing any secrets.
// Run: npm run check:firebase   (loads .env.local over .env, like `next dev` does)
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(file: string) {
  const path = resolve(process.cwd(), file);
  const values: Record<string, string> = {};
  if (!existsSync(path)) return { path, found: false, values };
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return { path, found: true, values };
}

const base = loadEnv(".env");
const local = loadEnv(".env.local");
const env: Record<string, string | undefined> = { ...base.values, ...local.values, ...process.env };
console.log(`.env found: ${base.found}, .env.local found: ${local.found}`);
for (const key of ["FIREBASE_SERVICE_ACCOUNT_PATH", "FIREBASE_DATABASE_URL", "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_PRIVATE_KEY_BASE64"]) {
  const where = [local.values[key] !== undefined && ".env.local", base.values[key] !== undefined && ".env"].filter(Boolean).join(" + ");
  console.log(`  ${key}: ${env[key] ? `set (${where || "process env"})` : "not set"}`);
}

let file: { project_id?: string; client_email?: string; private_key?: string } = {};
if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  const p = resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
  if (!existsSync(p)) throw new Error(`Service account file not found at ${p}`);
  file = JSON.parse(readFileSync(p, "utf8"));
}
const projectId = env.FIREBASE_PROJECT_ID || file.project_id;
const clientEmail = env.FIREBASE_CLIENT_EMAIL || file.client_email;
const privateKey = env.FIREBASE_PRIVATE_KEY_BASE64
  ? Buffer.from(env.FIREBASE_PRIVATE_KEY_BASE64, "base64").toString("utf8")
  : (env.FIREBASE_PRIVATE_KEY || file.private_key)?.replace(/\\n/g, "\n");
const databaseUrl = (env.FIREBASE_DATABASE_URL || (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : "")).replace(/\/$/, "");

console.log(`\nproject_id used:   ${projectId}`);
console.log(`service account:   ${clientEmail}`);
console.log(`database URL:      ${databaseUrl}`);
const urlProject = databaseUrl.match(/^https:\/\/([^.]+?)(?:-default-rtdb)?\./)?.[1];
if (projectId && urlProject && urlProject !== projectId) {
  console.log(`\n⚠ MISMATCH: the database URL is for "${urlProject}" but the credentials are for "${projectId}".`);
}
if (!privateKey?.includes("BEGIN PRIVATE KEY")) console.log("⚠ Private key is missing or not a PEM key.");

async function main() {
  const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64(JSON.stringify({
    iss: clientEmail, scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${signer.sign(privateKey!, "base64url")}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
  console.log(`\n1. Google token request: ${tokenRes.status} ${token.access_token ? "OK" : `FAILED — ${token.error}: ${token.error_description}`}`);
  if (!token.access_token) {
    console.log("   → The key itself is rejected (revoked, deleted, or wrong clock). Generate a new private key.");
    return;
  }
  const dbRes = await fetch(`${databaseUrl}/.json?shallow=true&access_token=${encodeURIComponent(token.access_token)}`);
  const body = await dbRes.text();
  console.log(`2. Database read:        ${dbRes.status} ${dbRes.ok ? "OK — top-level keys: " + body.slice(0, 200) : body.slice(0, 200)}`);
  if (dbRes.status === 401) console.log("   → Token is valid but this database rejects it: the key belongs to a different Firebase project than the database URL.");
  if (dbRes.status === 404) console.log("   → No database at that URL. Copy the exact URL from Firebase Console → Realtime Database → Data.");
}

main().catch((err) => {
  console.error("\nCheck failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
