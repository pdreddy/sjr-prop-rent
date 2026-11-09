import { buildPaymentHistory } from "./paymentHistory";
import { isRentOverdue } from "./month";
import type { PublicPlot, PublicRentMonth } from "./types";

// Whitelist public fields: never serialize admin notes, contact details or audit data.
export function buildPublicRentHistory(
  ...args: Parameters<typeof buildPaymentHistory>
): Pick<PublicPlot, "rentMonths" | "rentTotals"> {
  if (!args[0].tenantName?.trim()) {
    return { rentMonths: [], rentTotals: { billed: 0, paid: 0, due: 0, advance: 0 } };
  }
  const history = buildPaymentHistory(...args);
  const rentMonths: PublicRentMonth[] = history.months
    .filter((month) => !month.unapplied)
    .map((month) => ({
      month: month.month,
      recorded: month.recorded,
      bill: month.rentDue,
      paid: month.rentPaid,
      balance: month.rentBalance,
      paidDate: month.paidDate,
      advance: month.rentAdvance,
      status: month.beforeRentStart || !history.firstRentMonth
        ? "NA"
        : month.paymentStatus ?? (month.rentBalance <= 0
          ? "PAID"
          : month.rentPaid > 0
            ? "PARTIAL"
            : isRentOverdue(month.month) ? "UNPAID" : "DUE"),
    }));
  return {
    rentMonths,
    rentTotals: {
      billed: history.totals.rentDue,
      paid: history.totals.rentPaid,
      due: history.totals.rentBalance,
      advance: history.totals.rentAdvance,
    },
  };
}
