import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Primitive = string | number | boolean | null;
export type FirebaseValue = Primitive | Date | FirebaseValue[] | { [key: string]: FirebaseValue };

interface ServiceAccountFile {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

let configCache: { projectId: string; clientEmail: string; privateKey: string } | undefined;

function requireConfig() {
  if (configCache) return configCache;

  let fileConfig: ServiceAccountFile = {};
  const accountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (accountPath) {
    const absolutePath = resolve(/* turbopackIgnore: true */ process.cwd(), accountPath);
    try {
      fileConfig = JSON.parse(readFileSync(absolutePath, "utf8")) as ServiceAccountFile;
    } catch (error) {
      throw new Error(`Could not read Firebase service account at ${absolutePath}`, { cause: error });
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || fileConfig.project_id;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || fileConfig.client_email;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || fileConfig.private_key)?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase credentials are missing. Put the downloaded service-account JSON at ./firebase-service-account.json and set FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json in .env, or configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
    );
  }
  configCache = { projectId, clientEmail, privateKey };
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
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(config.privateKey, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Could not authenticate Firebase service account");
  tokenCache = { token: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

function encode(value: FirebaseValue): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: value };
}

function decode(value: Record<string, unknown>): FirebaseValue {
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return new Date(value.timestampValue as string);
  if ("booleanValue" in value) return value.booleanValue as boolean;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue as number;
  if ("stringValue" in value) return value.stringValue as string;
  if ("arrayValue" in value) return ((value.arrayValue as { values?: Record<string, unknown>[] }).values ?? []).map(decode);
  const fields = (value.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields ?? {};
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}

async function request(path: string, init?: RequestInit) {
  const config = requireConfig();
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json", ...init?.headers },
  });
  if (response.status === 404) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `Firestore request failed (${response.status})`);
  return result;
}

export async function getDocument<T>(path: string): Promise<(T & { id: string }) | null> {
  const doc = await request(path) as { name: string; fields?: Record<string, Record<string, unknown>> } | null;
  if (!doc) return null;
  return { id: doc.name.split("/").pop()!, ...Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decode(v)])) } as T & { id: string };
}

export async function listDocuments<T>(collection: string): Promise<(T & { id: string })[]> {
  const result = await request(`${collection}?pageSize=1000`) as { documents?: { name: string; fields?: Record<string, Record<string, unknown>> }[] } | null;
  return (result?.documents ?? []).map((doc) => ({ id: doc.name.split("/").pop()!, ...Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decode(v)])) })) as (T & { id: string })[];
}

export async function setDocument(path: string, data: Record<string, FirebaseValue>, merge = false) {
  const mask = merge ? `?${Object.keys(data).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&")}` : "";
  return request(`${path}${mask}`, { method: "PATCH", body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)])) }) });
}

export async function deleteDocument(path: string) { return request(path, { method: "DELETE" }); }

export function newDocumentId() { return crypto.randomUUID().replaceAll("-", ""); }
