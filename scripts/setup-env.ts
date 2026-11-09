import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { basename, join, resolve } from "node:path";

// One-command Firebase setup:  npm run setup:env            (looks for your downloaded key automatically)
//                              npm run setup:env -- /path/to/key.json
// Copies the service-account key to ./firebase-service-account.json, creates or completes .env
// (keeps anything already there), generates SESSION_SECRET, then checks the connection.
// The key and .env are gitignored; nothing secret is printed.
const ROOT = process.cwd();
const keyDest = join(ROOT, "firebase-service-account.json");

function looksLikeKey(file: string) {
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    return j.type === "service_account" && !!j.private_key && !!j.client_email && !!j.project_id;
  } catch { return false; }
}

function findCandidates(): string[] {
  const home = homedir();
  const roots = [ROOT, resolve(ROOT, ".."), join(home, "Downloads"), join(home, "Desktop"), join(home, "Documents")];
  const found = new Set<string>();
  const scan = (dir: string, depth: number) => {
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      if (name === "node_modules" || name.startsWith(".git") || name === ".next") continue;
      const p = join(dir, name);
      let isDir = false;
      try { isDir = statSync(p).isDirectory(); } catch { continue; }
      if (isDir) { if (depth > 0) scan(p, depth - 1); continue; }
      if (name.endsWith(".json") && (name === "firebase-service-account.json" || /firebase-adminsdk/.test(name)) && looksLikeKey(p)) found.add(p);
    }
  };
  roots.forEach((r) => scan(r, r === ROOT ? 0 : 2));
  return [...found];
}

function parseEnv(text: string) {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

async function main() {
  const arg = process.argv[2];
  let source = arg ? resolve(arg.replace(/^~/, homedir())) : "";
  if (!source) {
    if (existsSync(keyDest) && looksLikeKey(keyDest)) source = keyDest;
    else {
      const candidates = findCandidates();
      if (candidates.length === 1) source = candidates[0];
      else if (candidates.length > 1) {
        console.log("Found several key files; run again with the one you want:\n" + candidates.map((c) => `  npm run setup:env -- "${c}"`).join("\n"));
        process.exit(1);
      }
    }
  }
  if (!source || !looksLikeKey(source)) {
    console.log([
      "I could not find your Firebase service-account key (a .json file).",
      "Get it once: Firebase console > Project settings > Service accounts > Generate new private key.",
      "Then run:  npm run setup:env -- ~/Downloads/<the-downloaded-file>.json",
    ].join("\n"));
    process.exit(1);
  }

  if (resolve(source) !== keyDest) copyFileSync(source, keyDest);
  const key = JSON.parse(readFileSync(keyDest, "utf8"));
  console.log(`Using key for project "${key.project_id}" (${basename(source)}).`);

  const envPath = join(ROOT, ".env");
  const existing = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : new Map<string, string>();
  const additions: string[] = [];
  const need = (name: string, value: string) => { if (!existing.get(name)?.replace(/^["']|["']$/g, "")) additions.push(`${name}="${value}"`); };
  need("FIREBASE_SERVICE_ACCOUNT_PATH", "./firebase-service-account.json");
  need("FIREBASE_DATABASE_URL", `https://${key.project_id}-default-rtdb.firebaseio.com`);
  const secret = existing.get("SESSION_SECRET")?.replace(/^["']|["']$/g, "");
  if (!secret || secret.length < 32) additions.push(`SESSION_SECRET="${randomBytes(36).toString("base64")}"`);
  if (additions.length) {
    const base = existsSync(envPath) ? readFileSync(envPath, "utf8").replace(/\s*$/, "\n") : "";
    writeFileSync(envPath, `${base}${additions.join("\n")}\n`);
    console.log(`${existsSync(envPath) && base ? "Updated" : "Created"} .env (added: ${additions.map((a) => a.split("=")[0]).join(", ")}).`);
  } else console.log(".env already has everything needed.");

  // Load the new .env into this process, then test the connection.
  for (const [k, v] of parseEnv(readFileSync(envPath, "utf8"))) if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, "");
  const { listDocuments } = await import("../src/lib/firebase");
  try {
    const admins = await listDocuments<{ username: string }>("admins");
    console.log(`Connected to Firebase. Admin accounts stored: ${admins.length ? admins.map((a) => a.username).join(", ") : "none (set ADMIN_USERNAME / ADMIN_PASSWORD in .env to create one)"}.`);
    console.log("\nAll set. Start the app with:  npm run local");
  } catch (error) {
    console.log(`\nFiles are in place, but the connection check failed: ${error instanceof Error ? error.message : error}`);
    console.log("If the database is not in the default region, set FIREBASE_DATABASE_URL in .env to the URL shown in Firebase console > Realtime Database.");
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
