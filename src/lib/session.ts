import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "./constants";

export interface SessionPayload { adminId: string; username: string; expiresAt: number }

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(adminId: string, username: string) {
  const payload = Buffer.from(JSON.stringify({ adminId, username, expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return null;
  const expected = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (supplied.length !== expectedBuffer.length || !timingSafeEqual(supplied, expectedBuffer)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionPayload;
    return typeof value.adminId === "string" && typeof value.username === "string" && value.expiresAt > Date.now() ? value : null;
  } catch { return null; }
}

export async function setSessionCookie(adminId: string, username: string) {
  (await cookies()).set(SESSION_COOKIE_NAME, createSessionToken(adminId, username), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() { (await cookies()).delete(SESSION_COOKIE_NAME); }
export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? verifySessionToken(token) : null;
}
