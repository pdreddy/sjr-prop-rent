import { buildPaymentHistory } from "./paymentHistory";
import { isRentOverdue } from "./month";
import type { PublicPlot, PublicRentMonth } from "./types";

// Whitelist public fields: rent status only; never serialize rent amounts, dates, notes or audit data.
export function buildPublicRentHistory(
  ...args: Parameters<typeof buildPaymentHistory>
): Pick<PublicPlot, "rentMonths"> {
  if (!args[0].tenantName?.trim()) {
    return { rentMonths: [] };
  }
  const history = buildPaymentHistory(...args);
  const rentMonths: PublicRentMonth[] = history.months
    .filter((month) => !month.unapplied)
    .map((month) => ({
      month: month.month,
      status: month.beforeRentStart || !history.firstRentMonth
        ? "NA"
        : month.paymentStatus ?? (month.rentBalance <= 0
          ? "PAID"
          : month.rentPaid > 0
            ? "PARTIAL"
            : isRentOverdue(month.month) ? "UNPAID" : "DUE"),
    }));
  return { rentMonths };
}
