export type Role = "ADMIN" | "EMPLOYEE";
export type SpecialTitle = "CEO" | "SPECIAL";
export type TitleCategory = "SENIOR" | "STAFF" | "TEMP";
export type ResolvedTitleCategory = TitleCategory | SpecialTitle;
export type TitleLevel = "HIGH" | "LOW";
export type TitleSource = "AUTO" | "OVERRIDE" | "SPECIAL";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  specialTitle: SpecialTitle | null;
  isActive: boolean;
  createdAt?: string;
}

export interface DeliveryRecord {
  id: string;
  userId: string;
  date: string;
  forwardCount: number;
  reverseCount: number;
  note: string | null;
  user?: { id: string; name: string };
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  note: string | null;
  isActive: boolean;
  lastOilChangeMileage?: number;
}

export interface VehicleStatus extends Vehicle {
  lastOilChangeMileage: number;
  currentMileage: number;
  sinceLastOilChange: number;
  remainingToOilChange: number;
  needsOilChange: boolean;
  oilChangeWarning: boolean;
}

export interface MileageRecord {
  id: string;
  userId: string;
  vehicleId: string;
  date: string;
  startMileage: number;
  endMileage: number;
  distance: number;
  vehicle?: Vehicle;
  user?: { id: string; name: string };
}

export interface DispatchRecord {
  id: string;
  date: string;
  vehicleId: string | null;
  driverId: string;
  attendantId: string | null;
  driver?: { id: string; name: string };
  attendant?: { id: string; name: string } | null;
  vehicle?: { id: string; plateNumber: string } | null;
}

export interface SalarySettings {
  id: number;
  driverBonus: number;
  attendantBonus: number;
}

export interface MonthlyPricing {
  id: string;
  year: number;
  month: number;
  forwardPriceBeforeTax: number;
  reversePriceBeforeTax: number;
  forwardPriceAfterTax: number;
  reversePriceAfterTax: number;
}

export interface DailySalaryDetail {
  date: string;
  forwardCount: number;
  reverseCount: number;
  totalCount: number;
  rate: number;
  subtotal: number;
}

export interface EmployeeMonthlySalary {
  userId: string;
  userName: string;
  year: number;
  month: number;
  attendanceDays: number;
  totalDeliveryCount: number;
  averageDailyCount: number;
  titleCategory: ResolvedTitleCategory;
  titleLevel: TitleLevel | null;
  titleSource: TitleSource;
  dailyDetails: DailySalaryDetail[];
  pieceWorkTotal: number;
  driverDays: number;
  attendantDays: number;
  driverBonus: number;
  attendantBonus: number;
  driverBonusTotal: number;
  attendantBonusTotal: number;
  totalSalary: number;
}

export interface ReconciliationRecord {
  id: string;
  year: number;
  month: number;
  sourceFileName: string;
  excelTotalCount: number;
  excelTotalAmount: number;
  systemTotalCount: number;
  commissionRate: number;
  commissionAmount: number;
  netAmount: number;
  countDifference: number;
}

export interface DashboardData {
  year: number;
  month: number;
  today: { forwardTotal: number; reverseTotal: number };
  month_summary: {
    forwardTotal: number;
    reverseTotal: number;
    totalCount: number;
    estimatedSalaryTotal: number;
    estimatedRevenue: number | null;
    estimatedProfit: number | null;
    forwardPriceAfterTax: number | null;
    reversePriceAfterTax: number | null;
  };
  vehicles: VehicleStatus[];
  todayMileage: MileageRecord[];
  alerts: {
    pricingNotSet: boolean;
    unreconciledPreviousMonth: { year: number; month: number } | null;
    vehiclesNeedingOilChange: VehicleStatus[];
  };
}
