// Note: deliberately no "server-only" import here (unlike auth.ts/session.ts) —
// this module is also imported directly by the standalone scripts/*.ts tools,
// which run under plain Node/tsx rather than through Next.js's server bundling.
import { getRtdb } from "./firebase";
import type { PaymentStatusValue } from "./constants";

const UNITS_PATH = "units";
const UNITS_BY_PLOT_PATH = "unitsByPlotNumber";
const ADMINS_PATH = "admins";
const PAYMENTS_PATH = "payments";
const AUDIT_LOGS_PATH = "auditLogs";

/** RTDB keys can't contain `. $ # [ ] /` — base64url-encode arbitrary strings used as keys. */
function encodeKey(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

// RTDB omits any key whose value is `null` when writing, so reading it back
// gives `undefined` rather than `null`. These normalizers restore `null` for
// every nullable field so the rest of the app can rely on the TS types
// (`X | null`, never `X | undefined`).

function normalizeAdmin(id: string, raw: Omit<AdminRecord, "id">): AdminRecord {
  return {
    id,
    username: raw.username,
    passwordHash: raw.passwordHash,
    active: raw.active,
    failedLoginAttempts: raw.failedLoginAttempts ?? 0,
    lockedUntil: raw.lockedUntil ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function normalizeUnit(id: string, raw: Omit<UnitRecord, "id">): UnitRecord {
  return {
    id,
    plotNumber: raw.plotNumber,
    tenantName: raw.tenantName ?? null,
    moveInDate: raw.moveInDate ?? null,
    phone: raw.phone ?? null,
    monthlyRent: raw.monthlyRent,
    maintenanceAmount: raw.maintenanceAmount,
    active: raw.active,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function normalizePayment(id: string, raw: Omit<PaymentRecord, "id">): PaymentRecord {
  return {
    id,
    unitId: raw.unitId,
    month: raw.month,
    paymentStatus: raw.paymentStatus,
    rentAmount: raw.rentAmount,
    maintenanceAmount: raw.maintenanceAmount,
    amountPaid: raw.amountPaid,
    balanceDue: raw.balanceDue,
    paidDate: raw.paidDate ?? null,
    notes: raw.notes ?? null,
    updatedBy: raw.updatedBy ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function normalizeAuditLog(id: string, raw: Omit<AuditLogRecord, "id">): AuditLogRecord {
  return {
    id,
    adminUsername: raw.adminUsername ?? null,
    action: raw.action,
    recordType: raw.recordType,
    recordId: raw.recordId ?? null,
    previousValue: raw.previousValue ?? null,
    newValue: raw.newValue ?? null,
    createdAt: raw.createdAt,
  };
}

export interface AdminRecord {
  id: string; // same as username
  username: string;
  passwordHash: string;
  active: boolean;
  failedLoginAttempts: number;
  lockedUntil: number | null; // epoch ms
  createdAt: number;
  updatedAt: number;
}

export interface UnitRecord {
  id: string;
  plotNumber: string;
  tenantName: string | null;
  moveInDate: number | null; // epoch ms
  phone: string | null;
  monthlyRent: number;
  maintenanceAmount: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PaymentRecord {
  id: string; // `${unitId}_${month}`
  unitId: string;
  month: string;
  paymentStatus: PaymentStatusValue;
  rentAmount: number;
  maintenanceAmount: number;
  amountPaid: number;
  balanceDue: number;
  paidDate: number | null; // epoch ms
  notes: string | null;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AuditLogRecord {
  id: string;
  adminUsername: string | null;
  action: string;
  recordType: string;
  recordId: string | null;
  previousValue: unknown;
  newValue: unknown;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------------

export async function getAdminByUsername(username: string): Promise<AdminRecord | null> {
  const snap = await getRtdb().ref(`${ADMINS_PATH}/${username}`).get();
  if (!snap.exists()) return null;
  return normalizeAdmin(username, { username, ...snap.val() });
}

export async function updateAdmin(
  username: string,
  patch: Partial<Omit<AdminRecord, "id" | "username" | "createdAt">>
): Promise<void> {
  await getRtdb().ref(`${ADMINS_PATH}/${username}`).update({ ...patch, updatedAt: Date.now() });
}

/** Creates the admin if absent, or resets their password + lockout state if present. */
export async function upsertAdminPassword(username: string, passwordHash: string): Promise<void> {
  const ref = getRtdb().ref(`${ADMINS_PATH}/${username}`);
  const snap = await ref.get();
  const now = Date.now();
  if (snap.exists()) {
    await ref.update({
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    });
  } else {
    await ref.set({
      passwordHash,
      active: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export async function getUnitById(id: string): Promise<UnitRecord | null> {
  const snap = await getRtdb().ref(`${UNITS_PATH}/${id}`).get();
  if (!snap.exists()) return null;
  return normalizeUnit(id, snap.val());
}

export async function getUnitByPlotNumber(plotNumber: string): Promise<UnitRecord | null> {
  const idxSnap = await getRtdb().ref(`${UNITS_BY_PLOT_PATH}/${encodeKey(plotNumber)}`).get();
  if (!idxSnap.exists()) return null;
  return getUnitById(idxSnap.val() as string);
}

export async function listUnits(): Promise<UnitRecord[]> {
  const snap = await getRtdb().ref(UNITS_PATH).get();
  if (!snap.exists()) return [];
  const val = snap.val() as Record<string, Omit<UnitRecord, "id">>;
  return Object.entries(val).map(([id, data]) => normalizeUnit(id, data));
}

export async function createUnit(
  data: Omit<UnitRecord, "id" | "createdAt" | "updatedAt">
): Promise<UnitRecord> {
  const ref = getRtdb().ref(UNITS_PATH).push();
  const id = ref.key;
  if (!id) throw new Error("Failed to generate a unit id");
  const now = Date.now();
  const record: Omit<UnitRecord, "id"> = { ...data, createdAt: now, updatedAt: now };
  await ref.set(record);
  await getRtdb().ref(`${UNITS_BY_PLOT_PATH}/${encodeKey(data.plotNumber)}`).set(id);
  return { id, ...record };
}

export async function updateUnit(
  id: string,
  previousPlotNumber: string,
  patch: Partial<Omit<UnitRecord, "id" | "createdAt">>
): Promise<UnitRecord> {
  await getRtdb().ref(`${UNITS_PATH}/${id}`).update({ ...patch, updatedAt: Date.now() });

  if (patch.plotNumber !== undefined && patch.plotNumber !== previousPlotNumber) {
    await getRtdb().ref(`${UNITS_BY_PLOT_PATH}/${encodeKey(previousPlotNumber)}`).remove();
    await getRtdb().ref(`${UNITS_BY_PLOT_PATH}/${encodeKey(patch.plotNumber)}`).set(id);
  }

  const updated = await getUnitById(id);
  if (!updated) throw new Error(`Unit ${id} disappeared during update`);
  return updated;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function getPayment(unitId: string, month: string): Promise<PaymentRecord | null> {
  const snap = await getRtdb().ref(`${PAYMENTS_PATH}/${unitId}/${month}`).get();
  if (!snap.exists()) return null;
  return normalizePayment(`${unitId}_${month}`, snap.val());
}

/** Fetches one month's payment for many units in parallel. */
export async function getPaymentsForUnits(
  unitIds: string[],
  month: string
): Promise<Map<string, PaymentRecord>> {
  const results = await Promise.all(
    unitIds.map(async (unitId) => [unitId, await getPayment(unitId, month)] as const)
  );
  const map = new Map<string, PaymentRecord>();
  for (const [unitId, payment] of results) {
    if (payment) map.set(unitId, payment);
  }
  return map;
}

export async function upsertPayment(
  unitId: string,
  month: string,
  data: Omit<PaymentRecord, "id" | "unitId" | "month" | "createdAt" | "updatedAt">
): Promise<{ payment: PaymentRecord; wasCreate: boolean }> {
  const ref = getRtdb().ref(`${PAYMENTS_PATH}/${unitId}/${month}`);
  const existingSnap = await ref.get();
  const now = Date.now();
  const wasCreate = !existingSnap.exists();
  const record: Omit<PaymentRecord, "id"> = {
    unitId,
    month,
    ...data,
    createdAt: wasCreate ? now : existingSnap.val().createdAt,
    updatedAt: now,
  };
  await ref.set(record);
  return { payment: { id: `${unitId}_${month}`, ...record }, wasCreate };
}

/** Creates a payment only if one doesn't already exist for this unit+month (atomic). */
export async function createPaymentIfAbsent(
  unitId: string,
  month: string,
  data: Omit<PaymentRecord, "id" | "unitId" | "month" | "createdAt" | "updatedAt">
): Promise<boolean> {
  const ref = getRtdb().ref(`${PAYMENTS_PATH}/${unitId}/${month}`);
  const now = Date.now();
  const result = await ref.transaction((current) => {
    if (current !== null) return undefined; // abort — already exists
    return { unitId, month, ...data, createdAt: now, updatedAt: now };
  });
  return result.committed;
}

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export async function createAuditLog(entry: {
  adminUsername: string;
  action: string;
  recordType: string;
  recordId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
}): Promise<void> {
  const ref = getRtdb().ref(AUDIT_LOGS_PATH).push();
  await ref.set({
    adminUsername: entry.adminUsername,
    action: entry.action,
    recordType: entry.recordType,
    recordId: entry.recordId ?? null,
    previousValue: entry.previousValue ?? null,
    newValue: entry.newValue ?? null,
    createdAt: Date.now(),
  });
}

export async function listAuditLogs(limit: number): Promise<AuditLogRecord[]> {
  const snap = await getRtdb().ref(AUDIT_LOGS_PATH).orderByChild("createdAt").limitToLast(limit).get();
  if (!snap.exists()) return [];
  const val = snap.val() as Record<string, Omit<AuditLogRecord, "id">>;
  return Object.entries(val)
    .map(([id, data]) => normalizeAuditLog(id, data))
    .sort((a, b) => b.createdAt - a.createdAt);
}
