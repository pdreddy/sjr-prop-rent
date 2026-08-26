import { getDocument, listDocuments, newDocumentId, setDocument, type FirebaseValue } from "./firebase";
import { computeElectricityAmount } from "./electricity";
import type { PaymentDTO, PaymentStatus, UnitDTO } from "./types";

type StoredUnit = Omit<UnitDTO, "id" | "createdAt" | "updatedAt" | "moveInDate" | "advancePaidDate"> & {
  moveInDate: Date | null;
  advancePaidDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type StoredPayment = Omit<PaymentDTO, "id" | "createdAt" | "updatedAt" | "paidDate"> & { paidDate: Date | null; createdAt: Date; updatedAt: Date };
export interface AuditRecord { id: string; adminId: string; adminUsername: string; action: string; recordType: string; recordId: string | null; previousValue: FirebaseValue; newValue: FirebaseValue; createdAt: Date }

const iso = (date: Date | null) => date?.toISOString() ?? null;
// Legacy records stored a single `phone: string | null` before phoneNumbers existed.
export const unitDTO = (unit: StoredUnit & { id: string } & { phone?: string | null }): UnitDTO => {
  const { phone, ...rest } = unit;
  return {
    ...rest,
    phoneNumbers: unit.phoneNumbers ?? (phone ? [phone] : []),
    advanceAmount: unit.advanceAmount ?? 0,
    advancePaid: unit.advancePaid ?? 0,
    advancePaidDate: iso(unit.advancePaidDate),
    advanceNotes: unit.advanceNotes ?? null,
    moveInDate: iso(unit.moveInDate),
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  };
};
export const paymentDTO = (payment: StoredPayment & { id: string }): PaymentDTO => {
  const prevReading = payment.prevReading ?? 0;
  const currReading = payment.currReading ?? 0;
  return {
    ...payment,
    prevReading,
    currReading,
    electricityAmount: computeElectricityAmount(prevReading, currReading),
    electricityPaid: payment.electricityPaid ?? false,
    paidDate: iso(payment.paidDate),
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
};

export async function allUnits() { return (await listDocuments<StoredUnit>("units")).sort((a, b) => a.plotNumber.localeCompare(b.plotNumber, undefined, { numeric: true })); }
export async function unitById(id: string) { return getDocument<StoredUnit>(`units/${id}`); }
export async function unitByPlot(plotNumber: string) { return (await allUnits()).find((u) => u.plotNumber === plotNumber) ?? null; }
export async function createUnit(data: Omit<StoredUnit, "createdAt" | "updatedAt">) {
  const id = newDocumentId(), now = new Date();
  await setDocument(`units/${id}`, { ...data, createdAt: now, updatedAt: now });
  return { id, ...data, createdAt: now, updatedAt: now };
}
export async function updateUnit(id: string, data: Partial<Omit<StoredUnit, "createdAt">>) {
  await setDocument(`units/${id}`, { ...data, updatedAt: new Date() } as Record<string, FirebaseValue>, true);
  return (await unitById(id))!;
}

export async function allPayments() { return listDocuments<StoredPayment>("payments"); }
export async function paymentFor(unitId: string, month: string) { return getDocument<StoredPayment>(`payments/${unitId}_${month}`); }
export async function savePayment(unitId: string, month: string, data: Omit<StoredPayment, "unitId" | "month" | "createdAt" | "updatedAt">) {
  const id = `${unitId}_${month}`, existing = await paymentFor(unitId, month), now = new Date();
  const value = { unitId, month, ...data, createdAt: existing?.createdAt ?? now, updatedAt: now };
  await setDocument(`payments/${id}`, value);
  return { id, ...value };
}

export async function addAuditLog(data: Omit<AuditRecord, "id" | "createdAt">) {
  const id = newDocumentId();
  await setDocument(`auditLogs/${id}`, { ...data, createdAt: new Date() });
}
export async function auditLogs(limit: number) { return (await listDocuments<Omit<AuditRecord, "id">>("auditLogs")).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit); }

export function paymentStatus(amountPaid: number, expected: number): PaymentStatus { return amountPaid <= 0 ? "UNPAID" : amountPaid >= expected ? "PAID" : "PARTIAL"; }
