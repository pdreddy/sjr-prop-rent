import type { Unit, Payment } from "@/generated/prisma/client";

export function serializeUnit(unit: Unit) {
  return {
    ...unit,
    monthlyRent: Number(unit.monthlyRent),
  };
}

export function serializePayment(payment: Payment) {
  return {
    ...payment,
    rentAmount: Number(payment.rentAmount),
    amountPaid: Number(payment.amountPaid),
    balanceDue: Number(payment.balanceDue),
  };
}
