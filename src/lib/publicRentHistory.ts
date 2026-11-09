import { buildPaymentHistory } from "./paymentHistory";
import { isRentOverdue } from "./month";
import type { PaymentHistoryTenant, PaymentStatus, PublicPlot, PublicRentMonth } from "./types";

/** Residents see "Due" rather than "Unpaid" until the first-week payment window has passed. */
export function publicRentStatus(status: PaymentStatus | "NA", month: string): PublicRentMonth["status"] {
  return status === "UNPAID" && !isRentOverdue(month) ? "DUE" : status;
}

// Whitelist public fields: rent status only; never serialize rent amounts, dates, notes or audit data.
export function publicRentMonths(ledger: PaymentHistoryTenant): PublicRentMonth[] {
  return ledger.months
    .filter((month) => !month.unapplied)
    .map((month) => ({ month: month.month, status: publicRentStatus(month.rentStatus, month.month) }));
}

export function buildPublicRentHistory(
  ...args: Parameters<typeof buildPaymentHistory>
): Pick<PublicPlot, "rentMonths"> {
  if (!args[0].tenantName?.trim()) {
    return { rentMonths: [] };
  }
  return { rentMonths: publicRentMonths(buildPaymentHistory(...args)) };
}
