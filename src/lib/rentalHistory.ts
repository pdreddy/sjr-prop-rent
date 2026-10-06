import { monthsBetween } from "./electricityLedger";

// A plot only stores its *current* tenant, so earlier tenants are rebuilt from the audit log
// of unit edits: every time the tenant name / move-in date changed (or the plot was vacated)
// a snapshot was recorded. Edits that only fix a typo in a name therefore show as a new stay.

export interface UnitSnapshot {
  at: Date;
  tenantName: string | null;
  moveInDate: string | null;
}

export interface Stay {
  tenantName: string;
  moveInDate: string | null;
  /** When the tenant left: the next tenant's move-in date, or when the plot was recorded as vacated. */
  movedOutDate: string | null;
  /** First month covered by this stay (YYYY-MM). */
  startMonth: string;
  /** Last month covered, or null while the tenant is still in the plot. */
  endMonth: string | null;
}

const month = (iso: string) => iso.slice(0, 7);
export function buildStays(snapshots: UnitSnapshot[], currentMonth: string): Stay[] {
  const sorted = [...snapshots].sort((a, b) => a.at.getTime() - b.at.getTime());
  type Open = { tenantName: string; moveInDate: string | null; at: Date };
  const closed: (Open & { movedOutDate: string; vacated: boolean })[] = [];
  let open: Open | null = null;

  for (const snap of sorted) {
    const name = snap.tenantName?.trim() ?? "";
    if (!name) {
      if (open) {
        closed.push({ ...open, movedOutDate: snap.at.toISOString(), vacated: true });
        open = null;
      }
      continue;
    }
    if (open && open.tenantName.toLowerCase() === name.toLowerCase()) {
      open.moveInDate = snap.moveInDate ?? open.moveInDate; // move-in date corrected
      continue;
    }
    if (open) closed.push({ ...open, movedOutDate: snap.moveInDate ?? snap.at.toISOString(), vacated: false });
    open = { tenantName: name, moveInDate: snap.moveInDate, at: snap.at };
  }

  const all = [
    ...closed.map((c) => ({ ...c, ended: true as const })),
    ...(open ? [{ ...(open as Open), movedOutDate: null as string | null, vacated: false, ended: false as const }] : []),
  ];

  return all.map((stay, i) => {
    const startMonth = month(stay.moveInDate ?? stay.at.toISOString());
    const next = all[i + 1];
    let endMonth: string | null = null;
    if (stay.ended) {
      const outMonth = month(stay.movedOutDate!);
      // Replaced by a new tenant: months before theirs. Vacated: through the month it was recorded.
      endMonth = stay.vacated ? outMonth : next ? prevMonthOf(month(next.moveInDate ?? next.at.toISOString())) : outMonth;
      if (endMonth < startMonth) endMonth = startMonth;
    }
    if (endMonth && endMonth > currentMonth) endMonth = currentMonth;
    return { tenantName: stay.tenantName, moveInDate: stay.moveInDate, movedOutDate: stay.movedOutDate, startMonth, endMonth };
  });
}

function prevMonthOf(m: string) {
  let [y, mo] = m.split("-").map(Number);
  mo -= 1;
  if (mo < 1) { mo = 12; y -= 1; }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

export function monthsOfStay(stay: Stay, currentMonth: string): string[] {
  const end = stay.endMonth ?? currentMonth;
  return stay.startMonth <= end ? monthsBetween(stay.startMonth, end) : [];
}
