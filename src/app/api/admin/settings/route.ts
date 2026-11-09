import { withErrorHandling } from "@/lib/apiHandler";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/auth";
import {
  getElectricityConfig,
  getGeneralSettings,
  setElectricityConfig,
  setGeneralSettings,
} from "@/lib/store";
import { isMonthKey, parsePlotFixed, parsePlotList } from "@/lib/config";
import { recordAuditLog } from "@/lib/audit";

// Everything the admin can configure: electricity (rate, no-reading defaults, high plots, excess limit)
// and general (building name, public notice) settings. ADMIN only; SECURITY logins just enter meter readings.
const amount = (max: number) => z.coerce.number().min(0).max(max);
const profileSchema = z.object({
  slabLimit: amount(1_000_000),
  ratePerUnit: amount(1000),
  rateAboveLimit: amount(1000),
  fppcaPerUnit: amount(1000),
  surchargePerUnit: amount(1000),
  taxPercent: amount(100),
  fixedCharge: amount(1_000_000),
});
// One row per "from month"; the list must keep at least one row, with unique, valid YYYY-MM months.
const scheduleSchema = z
  .array(
    z.object({
      fromMonth: z.string().refine(isMonthKey, "From month must be a valid month (YYYY-MM)."),
      formula: z.enum(["flat", "slab"]),
    }),
  )
  .min(1, "Keep at least one row in the formula schedule.")
  .max(120)
  .refine((rows) => new Set(rows.map((r) => r.fromMonth)).size === rows.length, "Each From month can appear only once.")
  .transform((rows) => [...rows].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth)));
const schema = z.object({
  electricity: z.object({
    formulas: z.object({ flat: profileSchema, slab: profileSchema }),
    schedule: scheduleSchema,
    roundToRupee: z.boolean(),
    defaultHigh: amount(1_000_000),
    defaultStandard: amount(1_000_000),
    highPlots: z
      .union([z.string(), z.array(z.string())])
      .transform(parsePlotList),
    excessLimit: amount(10_000_000),
    plotFixed: z.string().max(2000).default("").transform(parsePlotFixed),
  }),
  general: z.object({
    buildingName: z
      .string()
      .trim()
      .min(1, "Building name is required")
      .max(100),
    showTenantNames: z.boolean(),
    maskTenantNames: z.boolean().optional(),
    notice: z.string().trim().max(500),
  }),
});

async function requireAdmin() {
  const admin = await getAuthedAdmin();
  if (!admin)
    return {
      error: NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 },
      ),
    };
  if (admin.role !== "ADMIN")
    return {
      error: NextResponse.json({ error: "Not authorized." }, { status: 403 }),
    };
  return { admin };
}

export const GET = withErrorHandling(async () => {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;
  const [electricity, general] = await Promise.all([
    getElectricityConfig(),
    getGeneralSettings(),
  ]);
  return NextResponse.json({ electricity, general });
});

export const PUT = withErrorHandling(async (request: NextRequest) => {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );

  const round = (n: number) => Math.round(n * 100) / 100;
  const roundProfile = (p: z.infer<typeof profileSchema>) => ({
    slabLimit: round(p.slabLimit),
    ratePerUnit: round(p.ratePerUnit),
    rateAboveLimit: round(p.rateAboveLimit),
    fppcaPerUnit: round(p.fppcaPerUnit),
    surchargePerUnit: round(p.surchargePerUnit),
    taxPercent: round(p.taxPercent),
    fixedCharge: round(p.fixedCharge),
  });
  const e = parsed.data.electricity;
  const electricity = {
    formulas: {
      flat: roundProfile(e.formulas.flat),
      slab: roundProfile(e.formulas.slab),
    },
    schedule: e.schedule,
    roundToRupee: e.roundToRupee,
    defaultHigh: round(e.defaultHigh),
    defaultStandard: round(e.defaultStandard),
    highPlots: e.highPlots,
    excessLimit: round(e.excessLimit),
    plotFixed: e.plotFixed,
  };

  const [previousElectricity, previousGeneral] = await Promise.all([
    getElectricityConfig(),
    getGeneralSettings(),
  ]);
  const general = {
    ...parsed.data.general,
    maskTenantNames:
      parsed.data.general.maskTenantNames ??
      previousGeneral.maskTenantNames ??
      false,
  };
  await Promise.all([
    setElectricityConfig(electricity, admin.username),
    setGeneralSettings(general, admin.username),
  ]);
  await recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "UPDATE",
    recordType: "Settings",
    previousValue: {
      electricity: previousElectricity,
      general: previousGeneral,
    },
    newValue: { electricity, general },
  });
  return NextResponse.json({ electricity, general });
});
