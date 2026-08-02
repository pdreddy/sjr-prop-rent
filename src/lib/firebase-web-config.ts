function envOrDefault(value: string | undefined, fallback: string) {
  if (value && value !== "undefined" && value !== "null") return value;
  return fallback;
}

/** Public browser configuration with optional Netlify/Next.js overrides. */
export const firebaseWebConfig = {
  apiKey: envOrDefault(process.env.NEXT_PUBLIC_FIREBASE_API_KEY, "AIzaSyDbO0eP52i4t3V94bEiDcl7WoKbSrrM9VA"),
  authDomain: envOrDefault(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, "koc2-20fb8.firebaseapp.com"),
  databaseURL: envOrDefault(process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, "https://koc2-20fb8-default-rtdb.firebaseio.com"),
  projectId: envOrDefault(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "koc2-20fb8"),
  storageBucket: envOrDefault(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, "koc2-20fb8.firebasestorage.app"),
  messagingSenderId: envOrDefault(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, "317734341461"),
  appId: envOrDefault(process.env.NEXT_PUBLIC_FIREBASE_APP_ID, "1:317734341461:web:1bcad5a1792fac0e46bddc"),
  measurementId: envOrDefault(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, "G-RHC8QXPWNM"),
} as const;

export const firebaseAppName = "sjr-rent-app";
