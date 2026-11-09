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

export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  await addAuditLog({
    adminId: input.adminId,
    adminUsername: input.adminUsername ?? "unknown",
    action: input.action,
    recordType: input.recordType,
    recordId: input.recordId ?? null,
    previousValue: (input.previousValue ?? null) as FirebaseValue,
    newValue: (input.newValue ?? null) as FirebaseValue,
  });
}
