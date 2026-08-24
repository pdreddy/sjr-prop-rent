export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const missing: string[] = [];

  if (!process.env.FIREBASE_DATABASE_URL) {
    missing.push("FIREBASE_DATABASE_URL");
  }
  if (
    !process.env.FIREBASE_SERVICE_ACCOUNT_JSON &&
    !process.env.FIREBASE_SERVICE_ACCOUNT_PATH &&
    !process.env.FIREBASE_DATABASE_EMULATOR_HOST
  ) {
    missing.push("FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT_PATH for local dev)");
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
    missing.push("SESSION_SECRET (must be at least 16 characters)");
  }

  if (missing.length > 0) {
    console.error(
      "\n" +
        "=".repeat(70) +
        "\n" +
        "SJR Rent Tracker: missing/invalid required environment variable(s):\n" +
        missing.map((m) => `  - ${m}`).join("\n") +
        "\n\n" +
        "Set these in your .env file (see .env.example) before starting the\n" +
        "app, or in your hosting provider's environment variable settings.\n" +
        "=".repeat(70) +
        "\n"
    );
  }
}
