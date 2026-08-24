import type { UnitRecord, PaymentRecord } from "./db";
import type { UnitDTO, PaymentDTO } from "./types";

function toIso(epochMs: number | null | undefined): string | null {
  return epochMs === null || epochMs === undefined ? null : new Date(epochMs).toISOString();
}

export function serializeUnit(unit: UnitRecord): UnitDTO {
  return {
    id: unit.id,
    plotNumber: unit.plotNumber,
    tenantName: unit.tenantName,
    moveInDate: toIso(unit.moveInDate),
    phone: unit.phone,
    monthlyRent: unit.monthlyRent,
    maintenanceAmount: unit.maintenanceAmount,
    active: unit.active,
    createdAt: toIso(unit.createdAt) as string,
    updatedAt: toIso(unit.updatedAt) as string,
  };
}

export function serializePayment(payment: PaymentRecord): PaymentDTO {
  return {
    id: payment.id,
    unitId: payment.unitId,
    month: payment.month,
    paymentStatus: payment.paymentStatus,
    rentAmount: payment.rentAmount,
    maintenanceAmount: payment.maintenanceAmount,
    amountPaid: payment.amountPaid,
    balanceDue: payment.balanceDue,
    paidDate: toIso(payment.paidDate),
    notes: payment.notes,
    updatedBy: payment.updatedBy,
    createdAt: toIso(payment.createdAt) as string,
    updatedAt: toIso(payment.updatedAt) as string,
  };
}
