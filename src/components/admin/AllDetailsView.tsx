"use client";

import { useEffect, useState } from "react";
import { formatMonthLabel } from "@/lib/month";
import { stripElectricityNote, withElectricityNote } from "@/lib/notes";
import type { DashboardRow } from "@/lib/types";
import { IconEdit, IconPlus, IconTrash } from "@/components/icons";

interface EditableRow {
  phoneNumbers: string[];
  advanceAmount: string;
  rent: string;
  maintenance: string;
  advancePaid: string;
  advancePaidDate: string;
  notes: string;
}

function buildEditableRow(row: DashboardRow): EditableRow {
  return {
    phoneNumbers: row.unit.phoneNumbers.length ? [...row.unit.phoneNumbers] : [""],
    advanceAmount: String(row.unit.advanceAmount),
    rent: String(row.payment?.rentAmount ?? row.unit.monthlyRent),
    maintenance: String(row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount),
    advancePaid: String(row.unit.advancePaid),
    advancePaidDate: row.unit.advancePaidDate?.slice(0, 10) ?? "",
    notes: stripElectricityNote(row.payment?.notes),
  };
}

const inputClass =
  "min-h-9 w-full rounded-lg border border-primary/25 bg-white px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function AllDetailsView({
  rows,
  month,
  onSaved,
  onError,
}: {
  rows: DashboardRow[];
  month: string;
  onSaved: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [edited, setEdited] = useState<Record<string, EditableRow>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editMode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed edit state when entering edit mode
    setEdited(Object.fromEntries(rows.map((row) => [row.unit.id, buildEditableRow(row)])));
  }, [editMode, rows]);

  function updateRow(unitId: string, patch: Partial<EditableRow>) {
    setEdited((prev) => ({ ...prev, [unitId]: { ...prev[unitId], ...patch } }));
  }

  async function saveAll() {
    setSaving(true);
    onError(null);
    try {
      for (const row of rows) {
        const e = edited[row.unit.id];
        if (!e) continue;

        const advancePaidNumber = Number(e.advancePaid || 0);
        if (advancePaidNumber > 0 && !e.advancePaidDate) {
          throw new Error(`Enter an advance paid date for plot ${row.unit.plotNumber} before saving.`);
        }

        const rentNumber = Number(e.rent || 0);
        const maintenanceNumber = Number(e.maintenance || 0);
        const phoneNumbers = e.phoneNumbers.map((p) => p.trim()).filter(Boolean);

        const unitRes = await fetch(`/api/admin/units/${row.unit.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumbers,
            advanceAmount: Number(e.advanceAmount || 0),
            advancePaid: advancePaidNumber,
            advancePaidDate: e.advancePaidDate || null,
            monthlyRent: rentNumber,
            maintenanceAmount: maintenanceNumber,
          }),
        });
        if (!unitRes.ok) {
          const json = await unitRes.json().catch(() => ({}));
          throw new Error(json.error ?? `Failed to save plot ${row.unit.plotNumber}.`);
        }

        // Rent payment status/amount-paid/balance for the month are untouched here —
        // this tab only tracks the advance — so carry them forward unchanged and just
        // sync rent/maintenance/notes onto the existing monthly payment record.
        const existingAmountPaid = row.payment?.amountPaid ?? 0;
        const rentSum = rentNumber + maintenanceNumber;
        const excessAmount = Math.max(0, existingAmountPaid - rentSum);

        const paymentRes = await fetch("/api/admin/payments", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitId: row.unit.id,
            month,
            paymentStatus: row.payment?.paymentStatus ?? "UNPAID",
            rentAmount: rentNumber,
            maintenanceAmount: maintenanceNumber,
            amountPaid: existingAmountPaid,
            balanceDue: row.payment?.balanceDue ?? Math.max(0, rentSum - existingAmountPaid),
            paidDate: row.payment?.paidDate ?? null,
            notes: withElectricityNote(e.notes, excessAmount),
            prevReading: row.payment?.prevReading ?? 0,
            currReading: row.payment?.currReading ?? 0,
            electricityPaid: row.payment?.electricityPaid ?? false,
          }),
        });
        if (!paymentRes.ok) {
          const json = await paymentRes.json().catch(() => ({}));
          throw new Error(json.error ?? `Failed to save details for plot ${row.unit.plotNumber}.`);
        }
      }
      onSaved(`Saved ${rows.length} plot${rows.length === 1 ? "" : "s"}.`);
      setEditMode(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save all details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-white p-3.5 shadow-sm">
        <p className="text-sm text-foreground/60">
          Full plot details for <span className="font-semibold text-foreground">{formatMonthLabel(month)}</span> —
          amount paid / paid date below is the advance, not rent.
        </p>
        {editMode ? (
          <div className="flex gap-2">
            <button
              onClick={() => setEditMode(false)}
              disabled={saving}
              className="min-h-10 rounded-full border border-primary/20 bg-white px-4 text-sm font-semibold text-foreground/70 hover:bg-primary-light disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={saveAll}
              disabled={saving}
              className="min-h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Saving all…" : "Save all"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditMode(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-primary/20 bg-white px-4 text-sm font-semibold text-primary-dark hover:bg-primary-light"
          >
            <IconEdit className="h-4 w-4" />
            Edit all
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-primary/15 bg-white p-8 text-center text-foreground/60">
          No plots match your search or filter.
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5 sm:hidden">
            {rows.map((row) => (
              <DetailCard
                key={row.unit.id}
                row={row}
                editMode={editMode}
                editable={edited[row.unit.id]}
                onChange={(patch) => updateRow(row.unit.id, patch)}
              />
            ))}
          </ul>

          <div className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-primary/10 bg-white shadow-sm sm:flex">
            <div className="max-h-[68vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-20 bg-primary-dark text-white shadow-[0_1px_0_rgba(0,0,0,0.08)]">
                  <tr>
                    <th className="sticky left-0 z-20 min-w-[150px] bg-primary-dark px-4 py-3 font-semibold">Plot &amp; tenant</th>
                    <th className="min-w-[170px] px-3 py-3 font-semibold">Phone numbers</th>
                    <th className="min-w-[100px] px-3 py-3 font-semibold">Advance</th>
                    <th className="min-w-[100px] px-3 py-3 font-semibold">Rent</th>
                    <th className="min-w-[110px] px-3 py-3 font-semibold">Maintenance</th>
                    <th className="min-w-[90px] px-3 py-3 font-semibold">Total</th>
                    <th className="min-w-[120px] px-3 py-3 font-semibold">Amount paid</th>
                    <th className="min-w-[120px] px-3 py-3 font-semibold">Paid date</th>
                    <th className="min-w-[200px] px-3 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <DetailTableRow
                      key={row.unit.id}
                      row={row}
                      striped={i % 2 === 1}
                      editMode={editMode}
                      editable={edited[row.unit.id]}
                      onChange={(patch) => updateRow(row.unit.id, patch)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PhoneNumbersField({
  phoneNumbers,
  onChange,
}: {
  phoneNumbers: string[];
  onChange: (phoneNumbers: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {phoneNumbers.map((number, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            value={number}
            onChange={(e) => {
              const next = [...phoneNumbers];
              next[i] = e.target.value;
              onChange(next);
            }}
            inputMode="tel"
            placeholder="Phone number"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onChange(phoneNumbers.filter((_, idx) => idx !== i))}
            aria-label="Remove phone number"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-unpaid/25 text-unpaid hover:bg-unpaid-bg"
          >
            <IconTrash className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...phoneNumbers, ""])}
        className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-primary/25 px-2 text-xs font-semibold text-primary-dark hover:bg-primary-light"
      >
        <IconPlus className="h-3.5 w-3.5" />
        Add number
      </button>
    </div>
  );
}

function DetailTableRow({
  row,
  striped,
  editMode,
  editable,
  onChange,
}: {
  row: DashboardRow;
  striped: boolean;
  editMode: boolean;
  editable?: EditableRow;
  onChange: (patch: Partial<EditableRow>) => void;
}) {
  const rowBg = striped ? "bg-primary-light/25" : "bg-white";
  const phoneNumbers = row.unit.phoneNumbers;

  if (editMode && editable) {
    const advancePaidNumber = Number(editable.advancePaid || 0);
    const rentSum = Number(editable.rent || 0) + Number(editable.maintenance || 0);

    return (
      <tr className="border-t border-primary/10 bg-primary-light/30 align-top">
        <td className="sticky left-0 z-10 bg-[#f5f8f7] px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Plot {row.unit.plotNumber}</p>
          <p className="font-bold text-foreground">{row.unit.tenantName || "Vacant"}</p>
        </td>
        <td className="px-2 py-2.5">
          <PhoneNumbersField phoneNumbers={editable.phoneNumbers} onChange={(phoneNumbers) => onChange({ phoneNumbers })} />
        </td>
        <td className="px-2 py-2.5">
          <input type="number" min="0" value={editable.advanceAmount} onChange={(e) => onChange({ advanceAmount: e.target.value })} className={inputClass} />
        </td>
        <td className="px-2 py-2.5">
          <input type="number" min="0" value={editable.rent} onChange={(e) => onChange({ rent: e.target.value })} className={inputClass} />
        </td>
        <td className="px-2 py-2.5">
          <input type="number" min="0" value={editable.maintenance} onChange={(e) => onChange({ maintenance: e.target.value })} className={inputClass} />
        </td>
        <td className="px-3 py-2.5 font-semibold text-foreground">₹{rentSum.toFixed(0)}</td>
        <td className="px-2 py-2.5">
          <input type="number" min="0" value={editable.advancePaid} onChange={(e) => onChange({ advancePaid: e.target.value })} className={inputClass} />
        </td>
        <td className="px-2 py-2.5">
          <input
            type="date"
            required={advancePaidNumber > 0}
            value={editable.advancePaidDate}
            onChange={(e) => onChange({ advancePaidDate: e.target.value })}
            className={inputClass}
          />
        </td>
        <td className="px-2 py-2.5">
          <input value={editable.notes} onChange={(e) => onChange({ notes: e.target.value })} className={inputClass} />
        </td>
      </tr>
    );
  }

  const rentAmount = row.payment?.rentAmount ?? row.unit.monthlyRent;
  const maintenanceAmount = row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount;
  const rentSum = rentAmount + maintenanceAmount;

  return (
    <tr className={`border-t border-primary/5 align-top ${rowBg}`}>
      <td className={`sticky left-0 z-10 px-4 py-3 ${rowBg}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Plot {row.unit.plotNumber}</p>
        <p className="font-bold text-foreground">{row.unit.tenantName || "Vacant"}</p>
      </td>
      <td className="px-3 py-3 text-foreground/80">{phoneNumbers.length ? phoneNumbers.join(", ") : "—"}</td>
      <td className="px-3 py-3">₹{row.unit.advanceAmount.toFixed(0)}</td>
      <td className="px-3 py-3">₹{rentAmount.toFixed(0)}</td>
      <td className="px-3 py-3">₹{maintenanceAmount.toFixed(0)}</td>
      <td className="px-3 py-3 font-semibold text-foreground">₹{rentSum.toFixed(0)}</td>
      <td className="px-3 py-3">₹{row.unit.advancePaid.toFixed(0)}</td>
      <td className="px-3 py-3 text-foreground/70">{row.unit.advancePaidDate?.slice(0, 10) || "—"}</td>
      <td className="max-w-[220px] whitespace-pre-line px-3 py-3 text-foreground/70 line-clamp-2">{row.payment?.notes || "—"}</td>
    </tr>
  );
}

function DetailCard({
  row,
  editMode,
  editable,
  onChange,
}: {
  row: DashboardRow;
  editMode: boolean;
  editable?: EditableRow;
  onChange: (patch: Partial<EditableRow>) => void;
}) {
  const labelClass = "text-xs font-semibold uppercase tracking-wide text-foreground/45";

  if (editMode && editable) {
    const advancePaidNumber = Number(editable.advancePaid || 0);
    const rentSum = Number(editable.rent || 0) + Number(editable.maintenance || 0);

    return (
      <li className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Plot {row.unit.plotNumber}</p>
        <p className="mb-3 font-bold text-foreground">{row.unit.tenantName || "Vacant"}</p>

        <div className="mb-3 flex flex-col gap-1">
          <span className={labelClass}>Phone numbers</span>
          <PhoneNumbersField phoneNumbers={editable.phoneNumbers} onChange={(phoneNumbers) => onChange({ phoneNumbers })} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Advance</span>
            <input type="number" min="0" value={editable.advanceAmount} onChange={(e) => onChange({ advanceAmount: e.target.value })} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Rent</span>
            <input type="number" min="0" value={editable.rent} onChange={(e) => onChange({ rent: e.target.value })} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Maintenance</span>
            <input type="number" min="0" value={editable.maintenance} onChange={(e) => onChange({ maintenance: e.target.value })} className={inputClass} />
          </label>
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Total</span>
            <div className="flex min-h-9 items-center rounded-lg bg-primary-light px-2 text-sm font-semibold text-primary-dark">₹{rentSum.toFixed(0)}</div>
          </div>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Amount paid (advance)</span>
            <input type="number" min="0" value={editable.advancePaid} onChange={(e) => onChange({ advancePaid: e.target.value })} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Paid date</span>
            <input
              type="date"
              required={advancePaidNumber > 0}
              value={editable.advancePaidDate}
              onChange={(e) => onChange({ advancePaidDate: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className={labelClass}>Notes</span>
            <input value={editable.notes} onChange={(e) => onChange({ notes: e.target.value })} className={inputClass} />
          </label>
        </div>
      </li>
    );
  }

  const rentAmount = row.payment?.rentAmount ?? row.unit.monthlyRent;
  const maintenanceAmount = row.payment?.maintenanceAmount ?? row.unit.maintenanceAmount;
  const rentSum = rentAmount + maintenanceAmount;

  return (
    <li className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Plot {row.unit.plotNumber}</p>
      <p className="font-bold text-foreground">{row.unit.tenantName || "Vacant"}</p>
      <p className="mt-2 text-sm text-foreground/70">
        {row.unit.phoneNumbers.length ? row.unit.phoneNumbers.join(", ") : "No phone numbers"}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground/70">
        <span>Advance ₹{row.unit.advanceAmount.toFixed(0)}</span>
        <span>Rent ₹{rentAmount.toFixed(0)}</span>
        <span>Maintenance ₹{maintenanceAmount.toFixed(0)}</span>
        <span className="font-semibold text-foreground">Total ₹{rentSum.toFixed(0)}</span>
        <span>Paid (advance) ₹{row.unit.advancePaid.toFixed(0)}</span>
        <span>Paid date {row.unit.advancePaidDate?.slice(0, 10) || "—"}</span>
      </div>
      {row.payment?.notes && <p className="mt-2 whitespace-pre-line text-sm text-foreground/60">{row.payment.notes}</p>}
    </li>
  );
}
