export type PaymentStatus = "PAID" | "UNPAID" | "PARTIAL";

export interface PublicPlot {
  plotNumber: string;
  status: "PAID" | "UNPAID";
}

export interface PublicStatusResponse {
  buildingName: string;
  month: string;
  totalPlots: number;
  paidCount: number;
  plots: PublicPlot[];
}

export interface UnitDTO {
  id: string;
  plotNumber: string;
  tenantName: string | null;
  phone: string | null;
  monthlyRent: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentDTO {
  id: string;
  unitId: string;
  month: string;
  paymentStatus: PaymentStatus;
  rentAmount: number;
  amountPaid: number;
  balanceDue: number;
  paidDate: string | null;
  notes: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardRow {
  unit: UnitDTO;
  payment: PaymentDTO | null;
  isVacant: boolean;
  effectiveStatus: PaymentStatus;
}

export interface DashboardTotals {
  totalExpected: number;
  totalCollected: number;
  numPaid: number;
  numPartial: number;
  numUnpaid: number;
  outstandingBalance: number;
  totalUnits: number;
}

export interface DashboardResponse {
  month: string;
  rows: DashboardRow[];
  totals: DashboardTotals;
}
