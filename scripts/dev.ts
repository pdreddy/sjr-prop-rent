import { spawn } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import { dbPrefix, listDocuments } from "../src/lib/firebase";

// Run the app locally against your REAL Firebase Realtime Database:  npm run local
// Loads the same .env* files and precedence as Next.js, then checks Firebase.
const { loadedEnvFiles } = loadEnvConfig(process.cwd(), true);
console.log(
  `Environment files: ${loadedEnvFiles.map((file) => file.path).join(", ") || "none found in the project folder"}`,
);
const APP_PORT = process.env.PORT ?? "3000";

async function main() {
  // Never talk to a local mock by accident: this command is for the real database only.
  if (process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    console.log(
      `Ignoring FIREBASE_DATABASE_EMULATOR_HOST (${process.env.FIREBASE_DATABASE_EMULATOR_HOST}); using the real Firebase database.`,
    );
    delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  }

  const problems: string[] = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    problems.push(
      "SESSION_SECRET in .env or .env.local must be at least 32 characters.",
    );
  if (problems.length) fail(problems);

  let admins: { username: string; active: boolean }[] = [];
  try {
    admins = await listDocuments<{ username: string; active: boolean }>(
      "admins",
    );
  } catch (error) {
    fail([
      `Could not connect to Firebase: ${error instanceof Error ? error.message : error}`,
      "Check .env: FIREBASE_SERVICE_ACCOUNT_PATH (and that the JSON file exists) and FIREBASE_DATABASE_URL.",
    ]);
  }

  const prefix = dbPrefix();
  console.log(
    `Connected to Firebase (${process.env.FIREBASE_DATABASE_URL ?? "derived from project id"}).`,
  );
  console.log(
    prefix
      ? `Data path: /${prefix}/ (TEST copy, not live data)`
      : "Data path: / (LIVE data: changes you make are real)",
  );
  const hasEnvAdmin = !!(
    process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD
  );
  console.log(
    admins.length
      ? `Admin accounts: ${admins.map((a) => a.username).join(", ")}. Sign in with your usual password.`
      : hasEnvAdmin
        ? `No admin stored yet: sign in with ADMIN_USERNAME / ADMIN_PASSWORD from .env (it will be created).`
        : "No admin account found and no ADMIN_USERNAME / ADMIN_PASSWORD in .env. Add them to .env first.",
  );
  if (!admins.length && !hasEnvAdmin) process.exit(1);

  if (process.argv.includes("--check")) return;

  const app = spawn("npx", ["next", "dev", "-p", APP_PORT], {
    stdio: "inherit",
    env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: "" }, // empty string so .env cannot switch it back on
    shell: process.platform === "win32",
  });
  const stop = () => {
    app.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  app.on("exit", (code) => process.exit(code ?? 0));
  console.log(
    `\n  Public page:  http://localhost:${APP_PORT}\n  Admin login:  http://localhost:${APP_PORT}/admin/login\n`,
  );
}

function fail(lines: string[]): never {
  console.error(
    `\n${lines.map((l) => `  x ${l}`).join("\n")}\n\nTip: run \`npm run auth:check\` for a fuller diagnosis.\n`,
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
