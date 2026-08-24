import "server-only";
import { createAuditLog as createAuditLogRecord } from "./db";

export interface AuditLogInput {
  adminId: string; // = admin username
  action: string;
  recordType: string;
  recordId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
}

export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  await createAuditLogRecord({
    adminUsername: input.adminId,
    action: input.action,
    recordType: input.recordType,
    recordId: input.recordId ?? null,
    previousValue: input.previousValue,
    newValue: input.newValue,
  });
}
