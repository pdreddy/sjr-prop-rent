import { z } from "zod";

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
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+\-() ]*$/, "Phone number contains invalid characters")
    .optional()
    .nullable(),
  monthlyRent: z.coerce.number().min(0).max(10_000_000),
});

export const updateUnitSchema = z.object({
  plotNumber: z.string().trim().min(1).max(50).optional(),
  tenantName: z.string().trim().max(200).optional().nullable(),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+\-() ]*$/, "Phone number contains invalid characters")
    .optional()
    .nullable(),
  monthlyRent: z.coerce.number().min(0).max(10_000_000).optional(),
  active: z.boolean().optional(),
});

export const paymentStatusEnum = z.enum(["PAID", "UNPAID", "PARTIAL"]);

export const upsertPaymentSchema = z.object({
  unitId: z.string().min(1),
  month: monthSchema,
  paymentStatus: paymentStatusEnum,
  rentAmount: z.coerce.number().min(0).max(10_000_000),
  amountPaid: z.coerce.number().min(0).max(10_000_000),
  balanceDue: z.coerce.number().min(-10_000_000).max(10_000_000),
  paidDate: z.string().trim().max(30).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const copyMonthSchema = z.object({
  sourceMonth: monthSchema,
  targetMonth: monthSchema,
});
