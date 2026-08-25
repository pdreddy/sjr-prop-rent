import { z } from "zod";

const phoneNumberSchema = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+\-() ]+$/, "Phone number contains invalid characters");
const phonesSchema = z.array(phoneNumberSchema).max(5, "Up to 5 phone numbers allowed").optional();

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(10, "New password must be at least 10 characters")
    .max(200),
});

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format");

export const createUnitSchema = z.object({
  plotNumber: z.string().trim().min(1).max(50),
  tenantName: z.string().trim().max(200).optional().nullable(),
  moveInDate: z.string().trim().max(30).optional().nullable(),
  phones: phonesSchema,
  advanceAmount: z.coerce.number().min(0).max(10_000_000).optional(),
  monthlyRent: z.coerce.number().min(0).max(10_000_000),
  maintenanceAmount: z.coerce.number().min(0).max(10_000_000).optional(),
});

export const updateUnitSchema = z.object({
  plotNumber: z.string().trim().min(1).max(50).optional(),
  tenantName: z.string().trim().max(200).optional().nullable(),
  moveInDate: z.string().trim().max(30).optional().nullable(),
  phones: phonesSchema,
  advanceAmount: z.coerce.number().min(0).max(10_000_000).optional(),
  monthlyRent: z.coerce.number().min(0).max(10_000_000).optional(),
  maintenanceAmount: z.coerce.number().min(0).max(10_000_000).optional(),
  active: z.boolean().optional(),
});

export const paymentStatusEnum = z.enum(["PAID", "UNPAID", "PARTIAL"]);

export const upsertPaymentSchema = z.object({
  unitId: z.string().min(1),
  month: monthSchema,
  paymentStatus: paymentStatusEnum,
  rentAmount: z.coerce.number().min(0).max(10_000_000),
  maintenanceAmount: z.coerce.number().min(0).max(10_000_000).default(0),
  amountPaid: z.coerce.number().min(0).max(10_000_000),
  balanceDue: z.coerce.number().min(-10_000_000).max(10_000_000),
  paidDate: z.string().trim().max(30).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  electricityPreviousReading: z.coerce.number().min(0).max(10_000_000).default(0),
  electricityCurrentReading: z.coerce.number().min(0).max(10_000_000).default(0),
  electricityAmount: z.coerce.number().min(0).max(10_000_000).default(0),
  electricityPaid: z.boolean().default(false),
}).refine((data) => data.electricityCurrentReading >= data.electricityPreviousReading, {
  message: "Current meter reading cannot be less than the previous reading.",
  path: ["electricityCurrentReading"],
});

export const copyMonthSchema = z.object({
  sourceMonth: monthSchema,
  targetMonth: monthSchema,
});
