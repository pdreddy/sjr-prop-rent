import { rupee, shortMonth } from "./format";
import type { PlotSummary } from "./types";

export type MessageKind = "thanks" | "reminder" | "warning";
export const MESSAGE_LABELS: Record<MessageKind, string> = { thanks: "Thank-you", reminder: "Reminder", warning: "Warning" };

/** The message that fits how the tenant is paying: thanks when all is clear, a warning when well behind. */
export function suggestedMessage(summary: PlotSummary): MessageKind {
  const owing = summary.rent.balance + summary.electricity.balance;
  if (summary.months.overdue >= 2) return "warning";
  return owing > 0 ? "reminder" : "thanks";
}

/** A ready-to-send message for the tenant. The admin can edit it before sending. */
export function buildPlotMessage(kind: MessageKind, ctx: { tenantName: string; plotNumber: string; buildingName: string; summary: PlotSummary }): string {
  const { summary } = ctx;
  const hello = `Hello ${ctx.tenantName.trim() || "there"},`;
  const sign = `- ${ctx.buildingName}`;
  const total = Math.round((summary.rent.balance + summary.electricity.balance) * 100) / 100;
  const months = summary.pendingMonths.map((m) => shortMonth(m.month)).join(", ");
  const dues = [
    summary.rent.balance > 0 ? `Rent: ${rupee(summary.rent.balance)}${months ? ` (${months})` : ""}` : "",
    summary.electricity.balance > 0 ? `Electricity: ${rupee(summary.electricity.balance)}` : "",
    summary.rent.balance > 0 && summary.electricity.balance > 0 ? `Total: ${rupee(total)}` : "",
  ].filter(Boolean);

  if (kind === "thanks") {
    const record = summary.timing.onTime > 0 && summary.timing.late === 0 ? ` You have paid on time ${summary.timing.onTime === 1 ? "this month" : `for ${summary.timing.onTime} months`}.` : "";
    return [hello, `Thank you for paying the rent for Plot ${ctx.plotNumber}.${record} We really appreciate it.`, sign].join("\n\n");
  }
  if (kind === "reminder") {
    return [hello, `This is a gentle reminder about the dues for Plot ${ctx.plotNumber}.`, dues.join("\n") || "Please check your dues on the resident page.", "Kindly pay at the earliest. If you have already paid, please ignore this message.", sign].join("\n\n");
  }
  const count = summary.months.overdue;
  return [
    hello,
    `The rent for Plot ${ctx.plotNumber} is overdue${count > 0 ? ` for ${count} month${count === 1 ? "" : "s"}` : ""}.`,
    dues.join("\n") || "Please check your dues on the resident page.",
    "Please clear the pending amount immediately, or contact us today to discuss.",
    sign,
  ].join("\n\n");
}

/** Digits for a wa.me link; a 10-digit Indian mobile number gets the 91 country code. */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length === 10 ? `91${digits}` : digits;
}
