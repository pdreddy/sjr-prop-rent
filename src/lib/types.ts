export type PaymentStatus = "PAID" | "UNPAID" | "PARTIAL";

export interface PublicPlot {
  plotNumber: string;
  tenantName: string | null;
  moveInDate: string | null;
  status: "PAID" | "UNPAID";
  electricity: {
    months: ElectricityMonth[];
    totalPending: number;
    totalUnits: number;
  };
}

export interface ElectricityMonth {
  month: string;
  units: number;
  amount: number;
  paid: number;
  pending: number;
}

export interface PublicStatusResponse {
  buildingName: string;
  month: string;
  totalPlots: number;
  paidCount: number;
  totalElectricityPending: number;
  plots: PublicPlot[];
}

export interface UnitDTO {
  id: string;
  plotNumber: string;
  tenantName: string | null;
  moveInDate: string | null;
  phone: string | null;
  monthlyRent: number;
  maintenanceAmount: number;
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
  maintenanceAmount: number;
  amountPaid: number;
  balanceDue: number;
  electricityUnits: number;
  electricityAmount: number;
  electricityPaid: number;
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
