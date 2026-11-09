import Decimal from "decimal.js";
import { z } from "zod";

// Round each printed line to paise, then sum. Decimal arithmetic avoids binary
// floating-point errors at half-paise boundaries (e.g. 1947.645 -> 1947.65).
const money = z.number().finite().min(0).max(1_000_000_000).multipleOf(0.01);
const quantity = z.number().finite().min(0).max(1_000_000_000);
export const taxComponents = ["fixed", "energy", "fppca", "surcharge"] as const;
export type TaxComponent = (typeof taxComponents)[number];
export const electricityInputSchema = z
  .object({
    previousReading: quantity,
    currentReading: quantity,
    meterConstant: z.number().finite().positive().max(1_000_000),
    billedLoadKw: quantity,
    recordedDemandKw: quantity,
    powerFactor: z.number().finite().min(0).max(1),
    fixedRate: quantity,
    energyRate: quantity,
    fppcaRate: quantity,
    surchargeRate: quantity,
    taxPercent: z.number().finite().min(0).max(100),
    taxableComponents: z.array(z.enum(taxComponents)).max(4),
    pfPenalty: money,
    excessDemandPenalty: money,
    interest: money,
    arrears: money,
    credits: money,
    rounding: z.enum(["NONE", "NEAREST_RUPEE", "UP_RUPEE", "DOWN_RUPEE"]),
    originalBillAmount: money.nullable(),
    tenantCollected: money,
    billReference: z.string().trim().max(200),
    originalBillUrl: z.union([
      z.literal(""),
      z
        .url()
        .max(2048)
        .refine(
          (url) => url.startsWith("https://"),
          "Bill links must use HTTPS.",
        ),
    ]),
    notes: z.string().trim().max(2000),
  })
  .refine((value) => value.currentReading >= value.previousReading, {
    message: "Current reading must be at least the previous reading.",
    path: ["currentReading"],
  });
export type ElectricityInput = z.infer<typeof electricityInputSchema>;

export const DEFAULT_ELECTRICITY_INPUT: ElectricityInput = {
  previousReading: 0,
  currentReading: 0,
  meterConstant: 1,
  billedLoadKw: 17,
  recordedDemandKw: 0,
  powerFactor: 1,
  fixedRate: 200,
  energyRate: 10.5,
  fppcaRate: 0.2,
  surchargeRate: 0.35,
  taxPercent: 9,
  taxableComponents: ["energy"],
  pfPenalty: 0,
  excessDemandPenalty: 0,
  interest: 0,
  arrears: 0,
  credits: 0,
  rounding: "NEAREST_RUPEE",
  originalBillAmount: null,
  tenantCollected: 0,
  billReference: "",
  originalBillUrl: "",
  notes: "",
};

/** Example transcribed from the supplied November 2026 building bill. */
export const RECEIPT_EXAMPLE: ElectricityInput = {
  ...DEFAULT_ELECTRICITY_INPUT,
  previousReading: 21978,
  currentReading: 24039,
  recordedDemandKw: 14.49,
  interest: 79.16,
  originalBillAmount: 28201,
};

export function calculateElectricity(input: ElectricityInput) {
  const value = electricityInputSchema.parse(input);
  const paise = (amount: Decimal) =>
    amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const units = new Decimal(value.currentReading)
    .minus(value.previousReading)
    .times(value.meterConstant);
  const lines = {
    fixed: paise(new Decimal(value.billedLoadKw).times(value.fixedRate)),
    energy: paise(units.times(value.energyRate)),
    fppca: paise(units.times(value.fppcaRate)),
    surcharge: paise(units.times(value.surchargeRate)),
  };
  const taxable = [...new Set(value.taxableComponents)].reduce(
    (total, key) => total.plus(lines[key]),
    new Decimal(0),
  );
  const tax = paise(taxable.times(value.taxPercent).div(100));
  const currentDemand = Object.values(lines)
    .reduce((total, line) => total.plus(line), new Decimal(0))
    .plus(tax)
    .plus(value.pfPenalty)
    .plus(value.excessDemandPenalty)
    .plus(value.interest);
  const beforeRounding = currentDemand.plus(value.arrears).minus(value.credits);
  const modes = {
    NEAREST_RUPEE: Decimal.ROUND_HALF_UP,
    UP_RUPEE: Decimal.ROUND_CEIL,
    DOWN_RUPEE: Decimal.ROUND_FLOOR,
  } as const;
  const netPayable =
    value.rounding === "NONE"
      ? beforeRounding
      : beforeRounding.toDecimalPlaces(0, modes[value.rounding]);
  const comparisonAmount = new Decimal(value.originalBillAmount ?? netPayable);
  return {
    units: units.toNumber(),
    fixed: lines.fixed.toNumber(),
    energy: lines.energy.toNumber(),
    fppca: lines.fppca.toNumber(),
    surcharge: lines.surcharge.toNumber(),
    taxable: taxable.toNumber(),
    tax: tax.toNumber(),
    currentDemand: currentDemand.toNumber(),
    beforeRounding: beforeRounding.toNumber(),
    roundingAdjustment: netPayable.minus(beforeRounding).toNumber(),
    netPayable: netPayable.toNumber(),
    originalDifference:
      value.originalBillAmount === null
        ? null
        : new Decimal(value.originalBillAmount).minus(netPayable).toNumber(),
    // Tenant collections are a reconciliation note, never a utility charge.
    collectionBalance: comparisonAmount.minus(value.tenantCollected).toNumber(),
  };
}

export type ElectricityCalculation = ReturnType<typeof calculateElectricity>;
export interface ElectricityRecord {
  input: ElectricityInput;
  calculation: ElectricityCalculation;
  updatedBy: string;
  updatedAt: number;
}
