import { BUILDING_READY_MONTH } from "./constants";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(month: string): boolean {
  return MONTH_REGEX.test(month);
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getPreviousMonth(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(month: string): string {
  if (!isValidMonth(month)) return month;
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum - 1, 1));
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// True only for months *before* the tenant's move-in month. Rent is paid at the end of the
// month, so the move-in month itself is a billable month (paid at its end).
export function isBeforeMoveInMonth(moveInDate: string | Date | null, month: string): boolean {
  if (!moveInDate) return false;
  const iso = moveInDate instanceof Date ? moveInDate.toISOString() : moveInDate;
  return iso.slice(0, 7) > month;
}

export function getNextMonth(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum, 1)); // monthNum is 1-based, so this is the next month
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// A tenant's rent records start the month AFTER they move in: the first record (paid in the first
// week of that month) holds the move-in month's rent, prorated if they didn't move in on the 1st.
// Moved in May 10 -> first record June; moved in June 1 -> first record July. Every record after
// that is the full agreed rent.
export function firstRentMonth(moveInDate: string | Date | null): string | null {
  if (!moveInDate) return null;
  const iso = moveInDate instanceof Date ? moveInDate.toISOString() : moveInDate;
  return getNextMonth(iso.slice(0, 7));
}

/** True when a move-in date is earlier than the month the building opened, which is almost always a wrong year (2016 for 2026). */
export function isBeforeBuildingOpened(moveInDate: string | Date | null): boolean {
  if (!moveInDate) return false;
  const iso = moveInDate instanceof Date ? moveInDate.toISOString() : moveInDate;
  return iso.slice(0, 7) < BUILDING_READY_MONTH;
}

/** True for months before the tenant's first rent record (no rent exists yet). */
export function isBeforeFirstRentMonth(moveInDate: string | Date | null, month: string): boolean {
  const first = firstRentMonth(moveInDate);
  return first !== null && first > month;
}

// A rent record is paid in the first week of its own month, so it only counts as overdue once
// that grace period (default: through the 7th) has passed.
const RENT_GRACE_DAY = 7;
export function isRentOverdue(month: string, now: Date = new Date()): boolean {
  const [year, monthNum] = month.split("-").map(Number);
  const cutoff = new Date(Date.UTC(year, monthNum - 1, RENT_GRACE_DAY + 1));
  return now.getTime() >= cutoff.getTime();
}

// Never offers a month before BUILDING_READY_MONTH — the building didn't exist yet,
// so there's no rent or electricity data to show for it.
export function getMonthOptions(count = 24): string[] {
  const options: string[] = [];
  let month = getCurrentMonth();
  for (let i = 0; i < count; i++) {
    options.push(month);
    if (month <= BUILDING_READY_MONTH) break;
    month = getPreviousMonth(month);
  }
  return options;
}
