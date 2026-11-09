import { formatMonthLabel, isRentOverdue } from "./month";
import { rupee, shortMonth } from "./format";
import type { PaymentHistoryTenant, PlotSummary } from "./types";

// Rent for a month is expected in its first week (through the 7th), the same rule that turns a month overdue.
const GRACE_DAY = 7;
const DAY = 24 * 60 * 60 * 1000;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * A plain-English account of how a tenant pays, built from their ledger (the same figures as every
 * other tab): how many months are paid, how punctual the payments are, what is outstanding, and the
 * things worth knowing about (late or missed months, electricity dues).
 */
export function buildPlotSummary(ledger: PaymentHistoryTenant, now: Date = new Date()): PlotSummary {
  const billed = ledger.firstRentMonth ? ledger.months.filter((m) => !m.beforeRentStart && !m.unapplied) : [];
  const paidInFull = billed.filter((m) => m.rentStatus === "PAID");
  const pending = billed.filter((m) => m.rentStatus !== "PAID");
  const overdue = pending.filter((m) => isRentOverdue(m.month, now));
  const dueNow = pending.length - overdue.length;
  const partial = pending.filter((m) => m.rentStatus === "PARTIAL").length;

  // Punctuality: every month that has a dated payment, compared with the 7th of that month.
  const timed = billed
    .filter((m) => m.paidDate && m.amountReceived > 0)
    .map((m) => {
      const [y, mo] = m.month.split("-").map(Number);
      const paid = new Date(m.paidDate!).getTime();
      const daysLate = Math.round((paid - Date.UTC(y, mo - 1, GRACE_DAY)) / DAY);
      // Day of the rent month the money arrived on (0 or less = before the month began).
      return { month: m.month, daysLate, day: Math.round((paid - Date.UTC(y, mo - 1, 1)) / DAY) + 1 };
    });
  const late = timed.filter((t) => t.daysLate > 0);
  const onTime = timed.length - late.length;
  const days = timed.map((t) => t.day).sort((a, b) => a - b);
  const usualDay = days.length ? days[Math.floor((days.length - 1) / 2)] : null;
  const avgDaysLate = late.length ? Math.round(late.reduce((s, t) => s + t.daysLate, 0) / late.length) : null;

  const lastPaid = ledger.months
    .filter((m) => !m.unapplied && m.paidDate && m.amountReceived > 0)
    .sort((a, b) => a.paidDate!.localeCompare(b.paidDate!))
    .pop();
  const { totals } = ledger;

  let rating: PlotSummary["rating"];
  if (billed.length === 0) rating = "new";
  else if (overdue.length >= 2) rating = "poor";
  else if (overdue.length === 1 || (timed.length > 0 && late.length * 2 > timed.length)) rating = "mixed";
  else rating = "good";
  const title = { new: "No rent billed yet", good: "Pays on time", mixed: late.length * 2 > timed.length && overdue.length === 0 ? "Usually pays late" : "Sometimes behind", poor: "Behind on rent" }[rating];

  const sentences: string[] = [];
  if (billed.length === 0) {
    sentences.push(ledger.firstRentMonth ? `Rent starts in ${formatMonthLabel(ledger.firstRentMonth)}.` : "No move-in date is set, so no rent is billed.");
  } else {
    sentences.push(`${paidInFull.length} of ${plural(billed.length, "month")} paid in full.`);
    if (timed.length) {
      const when = usualDay === null ? "" : usualDay < 1 ? " Usually pays before the month starts." : ` Usually pays around the ${ordinal(Math.min(usualDay, 31))}.`;
      sentences.push(`${onTime} of ${plural(timed.length, "payment")} on time (by the ${ordinal(GRACE_DAY)})${late.length ? `, ${late.length} late by about ${plural(avgDaysLate!, "day")}` : ""}.${when}`);
    }
    if (totals.rentBalance > 0) sentences.push(`${rupee(totals.rentBalance)} rent pending across ${plural(pending.length, "month")}.`);
    else sentences.push("No rent outstanding.");
    if (totals.rentAdvance > 0) sentences.push(`${rupee(totals.rentAdvance)} paid ahead.`);
  }
  if (totals.electricityBill > 0) {
    sentences.push(totals.electricityBalance > 0 ? `Electricity: ${rupee(totals.electricityBalance)} of ${rupee(totals.electricityBill)} still due.` : "Electricity is fully paid.");
  }

  // Things worth knowing, newest first.
  const notes: PlotSummary["notes"] = [];
  for (const m of [...billed].reverse()) {
    const timing = timed.find((t) => t.month === m.month);
    if (m.rentStatus !== "PAID" && isRentOverdue(m.month, now)) {
      notes.push({ tone: "bad", text: `${shortMonth(m.month)}: ${m.rentStatus === "PARTIAL" ? "partly paid" : "not paid"}, ${rupee(m.rentBalance)} pending` });
    } else if (timing && timing.daysLate > 0) {
      notes.push({ tone: "warn", text: `${shortMonth(m.month)}: paid ${plural(timing.daysLate, "day")} late (${dateLabel(m.paidDate!)})` });
    } else if (m.rentStatus === "PAID" && m.amountReceived < m.rentDue) {
      notes.push({ tone: "good", text: `${shortMonth(m.month)}: covered by rent paid ahead` });
    }
  }
  const unpaidElectricity = ledger.months.filter((m) => !m.unapplied && m.electricityBalance > 0);
  if (unpaidElectricity.length) {
    notes.push({ tone: "warn", text: `Electricity unpaid for ${plural(unpaidElectricity.length, "month")} (${unpaidElectricity.map((m) => shortMonth(m.month)).slice(-4).join(", ")}): ${rupee(totals.electricityBalance)}` });
  }
  if (totals.unusedCredit > 0) notes.push({ tone: "good", text: `${rupee(totals.unusedCredit)} electricity credit not used yet` });

  return {
    rating,
    title,
    text: sentences.join(" "),
    months: { billed: billed.length, paidInFull: paidInFull.length, partial, overdue: overdue.length, dueNow },
    timing: { onTime, late: late.length, usualDay, avgDaysLate },
    rent: { due: totals.rentDue, paid: totals.rentPaid, balance: totals.rentBalance, advance: totals.rentAdvance },
    electricity: { billed: totals.electricityBill, paid: totals.electricityBill - totals.electricityBalance, balance: totals.electricityBalance },
    lastPayment: lastPaid ? { date: lastPaid.paidDate!, amount: lastPaid.amountReceived, month: lastPaid.month } : null,
    pendingMonths: pending.filter((m) => m.rentBalance > 0).map((m) => ({ month: m.month, balance: m.rentBalance })),
    notes: notes.slice(0, 8),
  };
}
