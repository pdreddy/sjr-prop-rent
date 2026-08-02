import type { Unit, Payment } from "@/generated/prisma/client";

export function serializeUnit(unit: Unit) {
  return {
    ...unit,
    monthlyRent: Number(unit.monthlyRent),
    maintenanceAmount: Number(unit.maintenanceAmount),
  };
}

export function serializePayment(payment: Payment) {
  return {
    ...payment,
    rentAmount: Number(payment.rentAmount),
    maintenanceAmount: Number(payment.maintenanceAmount),
    amountPaid: Number(payment.amountPaid),
    balanceDue: Number(payment.balanceDue),
  };
}
