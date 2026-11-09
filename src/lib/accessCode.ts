import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";

// Tenant access codes are 6 digits, chosen by the admin or generated here, and given to the tenant
// privately. Together with the plot number they open that tenant's own account on the public page.
export const ACCESS_CODE_PATTERN = /^[0-9]{6}$/;

export function generateAccessCode(taken: Set<string> = new Set()): string {
  for (let i = 0; i < 50; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not generate a unique access code.");
}

export function codesMatch(expected: string | null | undefined, supplied: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
