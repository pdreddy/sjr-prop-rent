// Note: deliberately no "server-only" import — this module is also used by
// the standalone scripts/*.ts tools, which run under plain Node/tsx.
import fs from "node:fs";
import { cert, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getDatabase, type Database } from "firebase-admin/database";

function loadServiceAccount(): ServiceAccount {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    return JSON.parse(inlineJson) as ServiceAccount;
  }
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path) {
    return JSON.parse(fs.readFileSync(path, "utf-8")) as ServiceAccount;
  }
  throw new Error(
    "Set FIREBASE_SERVICE_ACCOUNT_JSON (recommended for deployment — paste the full " +
      "service account JSON as one env var) or FIREBASE_SERVICE_ACCOUNT_PATH (local dev — " +
      "path to a service account JSON file) environment variable."
  );
}

function createApp(): App {
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!databaseURL) {
    throw new Error("FIREBASE_DATABASE_URL environment variable is not set");
  }

  // Local Realtime Database emulator: no real credentials needed, just point
  // at the emulator host (set via FIREBASE_DATABASE_EMULATOR_HOST) with a
  // demo project id.
  if (process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    return initializeApp({
      databaseURL,
      projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-sjr-rent-tracker",
    });
  }

  return initializeApp({
    credential: cert(loadServiceAccount()),
    databaseURL,
  });
}

declare global {
  var __firebaseApp: App | undefined;
}

/**
 * Lazily creates (and memoizes) the Firebase Admin app on first use, rather
 * than at module import time. This matters because Next.js evaluates route
 * modules during `next build` to collect page data — if Firebase initialized
 * eagerly at import time, a build run without runtime secrets present
 * (common on some deploy setups, where env vars are only injected at
 * deploy/runtime, not build time) would fail the build itself instead of
 * just failing the specific request that needs the database.
 */
function getFirebaseApp(): App {
  if (!globalThis.__firebaseApp) {
    globalThis.__firebaseApp = createApp();
  }
  return globalThis.__firebaseApp;
}

export function getRtdb(): Database {
  return getDatabase(getFirebaseApp());
}
