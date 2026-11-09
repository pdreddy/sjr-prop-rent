// Turns raw audit-log records (before/after snapshots) into the readable change lists shown in the
// admin "Activity log". Pure functions, shared by the API route and its tests.

export interface AuditChange {
  /** Human label, e.g. "Amount paid" or "Electricity › Slab formula › Rate per unit". */
  label: string;
  /** Raw leaf key, e.g. "amountPaid" - the client uses it to choose a format. */
  key: string;
  from: unknown;
  to: unknown;
}

// Bookkeeping fields that change on every save or only restate the record's identity.
const IGNORED = new Set(["id", "createdAt", "updatedAt", "updatedBy", "unitId", "electricityAmount"]);

const LABELS: Record<string, string> = {
  rentAmount: "Rent",
  maintenanceAmount: "Maintenance",
  amountPaid: "Amount paid",
  balanceDue: "Balance due",
  paymentStatus: "Rent status",
  paidDate: "Paid on",
  notes: "Notes",
  prevReading: "Previous reading",
  currReading: "Current reading",
  electricityPaid: "Electricity marked paid",
  month: "Month",
  amount: "Building's power bill",
  tenantName: "Tenant",
  plotNumber: "Plot",
  monthlyRent: "Monthly rent",
  moveInDate: "Move-in date",
  phoneNumbers: "Phone numbers",
  active: "Active",
  advanceAmount: "Advance agreed",
  advancePaid: "Advance paid",
  advancePaidDate: "Advance paid on",
  advanceNotes: "Advance notes",
  electricity: "Electricity",
  general: "General",
  formulas: "Formulas",
  flat: "Flat formula",
  slab: "Slab formula",
  schedule: "Formula schedule",
  ratePerUnit: "Rate per unit",
  slabLimit: "Slab limit",
  rateAboveLimit: "Rate above limit",
  fppcaPerUnit: "FPPCA per unit",
  surchargePerUnit: "Surcharge per unit",
  taxPercent: "Tax %",
  fixedCharge: "Fixed charge",
  roundToRupee: "Round to rupee",
  defaultHigh: "Default bill (high plots)",
  defaultStandard: "Default bill (other plots)",
  highPlots: "High plots",
  excessLimit: "Over-payment limit",
  plotFixed: "Per-plot fixed bills",
  buildingName: "Building name",
  showTenantNames: "Show tenant names",
  maskTenantNames: "Mask tenant names",
  notice: "Public notice",
  moveInPaid: "Move-in rent received",
  moveInPaidFor: "Move-in paid for",
};

const humanize = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
export const labelForKey = (key: string) => LABELS[key] ?? humanize(key);

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Flattens nested objects into { "electricity.formulas.flat.ratePerUnit": 7 }. Arrays stay as one value. */
function flatten(value: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (isObject(v)) flatten(v, path, out);
      else out[path] = v;
    }
  } else if (prefix) out[prefix] = value;
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * What changed between two snapshots. Updates list only the fields whose value differs; a creation or
 * deletion lists the fields that carried a value (so a new payment shows what was entered).
 */
export function diffAudit(previous: unknown, next: unknown): AuditChange[] {
  const a = flatten(previous);
  const b = flatten(next);
  const created = !previous && !!next;
  const deleted = !!previous && !next;
  const changes: AuditChange[] = [];
  for (const path of [...new Set([...Object.keys(b), ...Object.keys(a)])]) {
    const leaf = path.split(".").pop() as string;
    if (IGNORED.has(leaf)) continue;
    const from = a[path];
    const to = b[path];
    if (created && (empty(to) || to === 0 || to === false)) continue;
    if (deleted && (empty(from) || from === 0 || from === false)) continue;
    if (!created && !deleted && same(from, to)) continue;
    const parts = path.split(".").map(labelForKey);
    changes.push({ label: parts.join(" › "), key: leaf, from: created ? null : (from ?? null), to: deleted ? null : (to ?? null) });
  }
  return changes;
}

/** Splits a payment-style record id ("<unitId>_2026-10") into its unit id and month. */
export function parsePaymentRecordId(recordId: string | null): { unitId: string; month: string } | null {
  const m = recordId?.match(/^(.+)_(\d{4}-\d{2})$/);
  return m ? { unitId: m[1], month: m[2] } : null;
}

export const AUDIT_GROUPS = ["Payment", "Electricity", "Unit", "Settings", "Other"] as const;
export type AuditGroup = (typeof AUDIT_GROUPS)[number];
export const auditGroupOf = (recordType: string): AuditGroup =>
  recordType === "Payment" || recordType === "MoveInPayment" ? "Payment" : recordType === "Electricity" || recordType === "BuildingBill" ? "Electricity" : recordType === "Unit" ? "Unit" : recordType === "Settings" ? "Settings" : "Other";
