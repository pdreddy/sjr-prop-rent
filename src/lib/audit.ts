import "server-only";
import { addAuditLog } from "./store";
import type { FirebaseValue } from "./firebase";

export interface AuditLogInput {
  adminId: string;
  adminUsername?: string;
  action: string;
  recordType: string;
  recordId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
}

// Tenant access codes are secrets: never copy them into the audit trail.
const redact = (value: unknown) => {
  if (value && typeof value === "object" && !Array.isArray(value) && "accessCode" in value) {
    const { accessCode: _code, ...rest } = value as Record<string, unknown>;
    void _code;
    return rest;
  }
  return value;
};

export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  await addAuditLog({
    adminId: input.adminId,
    adminUsername: input.adminUsername ?? "unknown",
    action: input.action,
    recordType: input.recordType,
    recordId: input.recordId ?? null,
    previousValue: (redact(input.previousValue) ?? null) as FirebaseValue,
    newValue: (redact(input.newValue) ?? null) as FirebaseValue,
  });
}
