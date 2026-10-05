export const BUILDING_NAME = process.env.BUILDING_NAME || "SJR Building";

// The building wasn't ready/rentable before this month, so no rent or electricity
// data exists earlier than it — the month picker never offers an earlier month.
// NEXT_PUBLIC_-prefixed because this value is also read from client components
// (month.ts is imported by both server routes and "use client" pages).
export const BUILDING_READY_MONTH = process.env.NEXT_PUBLIC_BUILDING_READY_MONTH || "2026-05";

export const SESSION_COOKIE_NAME = "sjr_session";
export const SESSION_DURATION_SECONDS = 12 * 60 * 60; // 12 hours

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

export const PAYMENT_STATUSES = ["PAID", "UNPAID", "PARTIAL"] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];

const configuredElectricityRate = Number(process.env.NEXT_PUBLIC_ELECTRICITY_RATE_PER_UNIT ?? "7");

// This value is public by design: residents should be able to see the rate used
// to calculate every meter bill. Invalid or negative configuration falls back
// to the established ₹7/unit rate instead of producing NaN bills.
export const ELECTRICITY_RATE_PER_UNIT =
  Number.isFinite(configuredElectricityRate) && configuredElectricityRate >= 0
    ? configuredElectricityRate
    : 7;
