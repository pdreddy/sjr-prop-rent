// Runs once when the server starts: print a clear message if required settings are missing, instead of
// failing later on the first request with a vague error.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const missing: string[] = [];
  const hasFirebase =
    !!process.env.FIREBASE_DATABASE_EMULATOR_HOST ||
    !!process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    (!!process.env.FIREBASE_PROJECT_ID && !!process.env.FIREBASE_CLIENT_EMAIL && !!(process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY_BASE64));
  if (!hasFirebase) missing.push("Firebase credentials: FIREBASE_SERVICE_ACCOUNT_PATH, or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY(_BASE64)");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) missing.push("SESSION_SECRET (at least 32 characters)");

  if (missing.length > 0) {
    const bar = "=".repeat(70);
    console.error(`\n${bar}\nSJR Rent Tracker: missing or invalid settings:\n${missing.map((m) => `  - ${m}`).join("\n")}\n\nSet them in .env (see .env.example) or in your host's environment settings.\nRun \`npm run auth:check\` to diagnose.\n${bar}\n`);
  }
}
