import { dbPrefix, listDocuments } from "../src/lib/firebase";
import { verifyPassword } from "../src/lib/password";

// Diagnoses "I can't sign in": `npm run auth:check` or `npm run auth:check -- <username> <password>`.
// Checks the env vars the login needs, the Firebase connection, and the stored admin accounts.
const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => { console.log(`  FAIL  ${m}`); failed = true; };
let failed = false;

async function main() {
  const [username, password] = process.argv.slice(2);
  console.log("Environment");
  const secret = process.env.SESSION_SECRET;
  if (!secret) bad("SESSION_SECRET is not set (every login fails with a server error)");
  else if (secret.length < 32) bad(`SESSION_SECRET is only ${secret.length} characters; it needs at least 32`);
  else ok("SESSION_SECRET is set");
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) ok(`ADMIN_USERNAME / ADMIN_PASSWORD set (user "${process.env.ADMIN_USERNAME}")`);
  else console.log("  note  ADMIN_USERNAME / ADMIN_PASSWORD not set: only admins already stored in the database can sign in");
  const prefix = dbPrefix();
  console.log(`  note  database path: ${prefix ? `/${prefix}/ (test copy)` : "/ (live data)"}`);

  console.log("Database");
  let admins: { id: string; username: string; passwordHash: string; active: boolean; role?: string }[] = [];
  try {
    admins = await listDocuments("admins");
    ok(`connected to Firebase; ${admins.length} admin account(s) stored`);
  } catch (error) {
    bad(`could not reach Firebase: ${error instanceof Error ? error.message : error}`);
    console.log("        Check FIREBASE_SERVICE_ACCOUNT_PATH / FIREBASE_DATABASE_URL in .env and that the file exists.");
    return;
  }
  for (const a of admins) console.log(`  note  admin "${a.username}" role=${a.role ?? "ADMIN"} active=${a.active}`);
  if (admins.length === 0 && !(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD)) bad("no admin stored and no ADMIN_USERNAME/ADMIN_PASSWORD to create one");

  if (username && password) {
    console.log(`Sign-in test for "${username}"`);
    const admin = admins.find((a) => a.username.toLowerCase() === username.trim().toLowerCase());
    const bootstrap = process.env.ADMIN_USERNAME?.toLowerCase() === username.trim().toLowerCase() && process.env.ADMIN_PASSWORD === password;
    if (!admin && bootstrap) ok("no stored account yet; the first login with the .env credentials will create it");
    else if (!admin) bad("no such username in the database (and it does not match the .env bootstrap login)");
    else if (!admin.active) bad("account exists but is inactive");
    else if (await verifyPassword(password, admin.passwordHash)) ok("password matches the stored hash");
    else {
      bad("password does NOT match the stored hash");
      console.log("        The stored password wins over .env once an account exists. Reset it with:");
      console.log(`        npm run admin:set-password -- ${admin.username} "<new password, 10+ chars>"`);
    }
  }
}

main().then(() => { console.log(failed ? "\nProblems found above." : "\nNo problems found."); process.exit(failed ? 1 : 0); }).catch((error) => { console.error(error); process.exit(1); });
