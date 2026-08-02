import "server-only";
import { prisma } from "./prisma";

export interface AuditLogInput {
  adminId: string;
  action: string;
  recordType: string;
  recordId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
}

export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      recordType: input.recordType,
      recordId: input.recordId ?? null,
      previousValue: input.previousValue === undefined ? undefined : (input.previousValue as object),
      newValue: input.newValue === undefined ? undefined : (input.newValue as object),
    },
  });
}
