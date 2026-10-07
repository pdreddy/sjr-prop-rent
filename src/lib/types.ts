export type PaymentStatus = "PAID" | "UNPAID" | "PARTIAL";
export type AdminRole = "ADMIN" | "SECURITY";

export interface ElectricityRow {
  unitId: string;
  plotNumber: string;
  tenantName: string | null;
  isBeforeMoveIn: boolean;
  prevReading: number;
  currReading: number;
  electricityAmount: number;
  electricityPaid: boolean;
  /** Part of this month's bill covered by rent overpayments (or all of it if marked paid). */
  electricityCovered: number;
  /** Still owed for this month after overpayments. */
  electricityBalance: number;
  /** Total still owed for electricity across all months for this tenant. */
  outstandingTotal: number;
}

export interface ElectricityListResponse {
  month: string;
  ratePerUnit: number;
  rows: ElectricityRow[];
}

export interface PublicPlot {
  plotNumber: string;
  tenantName: string | null;
  moveInDate: string | null;
  /** DUE: unpaid, but the first-week-of-next-month payment window hasn't passed yet. */
  status: PaymentStatus | "DUE" | "NA";
  paidDate: string | null;
  electricityStatus: "PAID" | "UNPAID" | "NA";
  electricityAmount: number;
  electricityCovered: number;
  electricityBalance: number;
  prevReading: number;
  currReading: number;
  /** Sum of electricity bills across all months that are still unpaid. */
  unpaidElectricityTotal: number;
  unpaidElectricityMonths: { month: string; bill: number; paid: number; amount: number }[];
}

export interface PublicStatusResponse {
  buildingName: string;
  ratePerUnit: number;
  month: string;
  totalPlots: number;
  paidCount: number;
  plots: PublicPlot[];
}

export interface UnitDTO {
  id: string;
  plotNumber: string;
  tenantName: string | null;
  moveInDate: string | null;
  phoneNumbers: string[];
  advanceAmount: number;
  advancePaid: number;
  advancePaidDate: string | null;
  advanceNotes: string | null;
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
  paidDate: string | null;
  notes: string | null;
  prevReading: number;
  currReading: number;
  electricityAmount: number;
  electricityPaid: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardRow {
  unit: UnitDTO;
  payment: PaymentDTO | null;
  isVacant: boolean;
  isBeforeMoveIn: boolean;
  effectiveStatus: PaymentStatus;
  /** Rent / maintenance owed for the month when no payment record exists (prorated in the move-in month). */
  expectedRent: number;
  expectedMaintenance: number;
  proratedDays: number | null;
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
  electricityRatePerUnit: number;
  rows: DashboardRow[];
  totals: DashboardTotals;
}

export type ElectricityMonthStatus = "PAID" | "PARTIAL" | "UNPAID" | "NONE";

export interface ElectricityStatementMonth {
  month: string;
  recorded: boolean;
  rentAmount: number;
  maintenanceAmount: number;
  baseline: number;
  totalPaid: number;
  excess: number;
  credited: number;
  carriedForward: number;
  electricityBill: number;
  balance: number;
  markedPaid: boolean;
  status: ElectricityMonthStatus;
}

export interface ElectricityStatementTenant {
  unitId: string;
  plotNumber: string;
  tenantName: string | null;
  moveInDate: string | null;
  months: ElectricityStatementMonth[];
  totals: { bill: number; credited: number; balance: number; unusedCredit: number };
}

export interface ElectricityStatementResponse {
  ratePerUnit: number;
  currentMonth: string;
  tenants: ElectricityStatementTenant[];
}

export interface RentalHistoryMonth {
  month: string;
  recorded: boolean;
  status: PaymentStatus | null;
  due: number;
  amountPaid: number;
  balanceDue: number;
  paidDate: string | null;
  /** Days charged when this is the move-in month (rent × days / 30), otherwise null. */
  proratedDays: number | null;
}

export interface RentalStay {
  tenantName: string;
  moveInDate: string | null;
  movedOutDate: string | null;
  startMonth: string;
  endMonth: string | null;
  monthsPaid: number;
  totalPaid: number;
  months: RentalHistoryMonth[];
}

export interface RentalHistoryPlot {
  unitId: string;
  plotNumber: string;
  currentTenant: string | null;
  stays: RentalStay[];
}

export interface RentalHistoryResponse {
  currentMonth: string;
  plots: RentalHistoryPlot[];
}

export interface MoveInProrationTenant {
  unitId: string;
  plotNumber: string;
  tenantName: string;
  moveInDate: string | null;
  monthlyRent: number;
  maintenanceAmount: number;
  /** Rent received by the 10th of the month after move-in; null until entered. */
  paidByTenth: number | null;
}

export interface MoveInProrationResponse {
  tenants: MoveInProrationTenant[];
}
