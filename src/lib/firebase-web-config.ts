/**
 * Public Firebase browser configuration supplied for the koc2 project.
 * These identifiers are intentionally safe to include in browser JavaScript;
 * privileged Firestore access remains server-only in `firebase.ts`.
 */
export const firebaseWebConfig = {
  apiKey: "AIzaSyDbO0eP52i4t3V94bEiDcl7WoKbSrrM9VA",
  authDomain: "koc2-20fb8.firebaseapp.com",
  databaseURL: "https://koc2-20fb8-default-rtdb.firebaseio.com",
  projectId: "koc2-20fb8",
  storageBucket: "koc2-20fb8.firebasestorage.app",
  messagingSenderId: "317734341461",
  appId: "1:317734341461:web:1bcad5a1792fac0e46bddc",
  measurementId: "G-RHC8QXPWNM",
} as const;
