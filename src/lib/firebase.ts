import "server-only";
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Primitive = string | number | boolean | null;
export type FirebaseValue = Primitive | Date | FirebaseValue[] | { [key: string]: FirebaseValue };

interface ServiceAccountFile { project_id?: string; client_email?: string; private_key?: string }
interface FirebaseConfig { projectId: string; clientEmail: string; privateKey: string; databaseUrl: string }
const REQUEST_TIMEOUT_MS = 15_000;
const INVALID_KEY_CHARACTERS = /[.#$\[\]/\u0000-\u001F\u007F]/;
let configCache: FirebaseConfig | undefined;

function requireConfig(): FirebaseConfig {
  if (configCache) return configCache;
  let fileConfig: ServiceAccountFile = {};
  const accountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (accountPath) {
    const absolutePath = resolve(/* turbopackIgnore: true */ process.cwd(), accountPath);
    try { fileConfig = JSON.parse(readFileSync(absolutePath, "utf8")) as ServiceAccountFile; }
    catch (error) { throw new Error(`Could not read Firebase service account at ${absolutePath}`, { cause: error }); }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || fileConfig.project_id;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || fileConfig.client_email;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || fileConfig.private_key)?.replace(/\\n/g, "\n");
  const databaseUrl = process.env.FIREBASE_DATABASE_URL || (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined);
  if (!projectId || !clientEmail || !privateKey || !databaseUrl) {
    throw new Error("Firebase credentials are missing. Configure FIREBASE_SERVICE_ACCOUNT_PATH and FIREBASE_DATABASE_URL, or provide the individual service-account variables.");
  }
  configCache = { projectId, clientEmail, privateKey, databaseUrl: databaseUrl.replace(/\/$/, "") };
  return configCache;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");
let tokenCache: { token: string; expiresAt: number } | undefined;

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const config = requireConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: config.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(config.privateKey, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Could not authenticate Firebase service account");
  tokenCache = { token: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

function encode(value: FirebaseValue): unknown {
  if (value instanceof Date) return { __type: "date", value: value.toISOString() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  return value;
}

function decode(value: unknown): FirebaseValue {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.__type === "date" && typeof record.value === "string") return new Date(record.value);
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, decode(item)]));
  }
  return value as Primitive;
}

async function request(path: string, init?: RequestInit) {
  if (!path || path.split("/").some((segment) => !segment || INVALID_KEY_CHARACTERS.test(segment))) {
    throw new Error(`Invalid Firebase Realtime Database path: ${path}`);
  }
  const token = await accessToken();
  const response = await fetch(`${requireConfig().databaseUrl}/${path}.json`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.error || `Realtime Database request failed (${response.status})`);
  return result;
}

export async function getDocument<T>(path: string): Promise<(T & { id: string }) | null> {
  const result = await request(path);
  if (result === null) return null;
  return { id: path.split("/").pop()!, ...(decode(result) as T) };
}

export async function listDocuments<T>(collection: string): Promise<(T & { id: string })[]> {
  const result = await request(collection) as Record<string, unknown> | null;
  return Object.entries(result ?? {}).map(([id, value]) => ({ id, ...(decode(value) as T) }));
}

export async function setDocument(path: string, data: Record<string, FirebaseValue>, merge = false) {
  return request(path, { method: merge ? "PATCH" : "PUT", body: JSON.stringify(encode(data)) });
}

export async function deleteDocument(path: string) { return request(path, { method: "DELETE" }); }
export function newDocumentId() { return crypto.randomUUID().replaceAll("-", ""); }
