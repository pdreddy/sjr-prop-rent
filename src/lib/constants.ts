export const BUILDING_NAME = process.env.BUILDING_NAME || "SJR Building";

export const SESSION_COOKIE_NAME = "sjr_session";
export const SESSION_DURATION_SECONDS = 12 * 60 * 60; // 12 hours

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

export const PAYMENT_STATUSES = ["PAID", "UNPAID", "PARTIAL"] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];

export const ELECTRICITY_RATE_PER_UNIT = 7;
