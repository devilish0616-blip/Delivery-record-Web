export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";
export type VehicleType = "MOTORCYCLE" | "TRUCK";
export type DailyRoleType = "NONE" | "TRUCK_DRIVER" | "TRUCK_ATTENDANT";
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
  monthlyAllowance?: number;
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

export interface BatchImportFailure {
  row: number;
  reason: string;
}

export interface BatchImportResult {
  dryRun: boolean;
  totalRows: number;
  successCount: number;
  failureCount: number;
  failures: BatchImportFailure[];
  employees: string[];
  dateRange: { from: string; to: string } | null;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  type: VehicleType;
  note: string | null;
  isActive: boolean;
  currentMileage: number;
}

export interface MaintenanceItemStatus {
  id: string;
  itemName: string;
  intervalKm: number;
  lastChangeMileage: number;
  lastChangeNote: string | null;
  lastChangeAt: string | null;
  sinceLastChange: number;
  remaining: number;
  needsChange: boolean;
  warning: boolean;
}

export interface VehicleStatus extends Vehicle {
  maintenanceItems: MaintenanceItemStatus[];
  needsMaintenance: boolean;
  maintenanceWarning: boolean;
}

export interface MileageRecord {
  id: string;
  userId: string;
  vehicleId: string;
  date: string;
  endMileage: number;
  distance: number | null;
  vehicle?: Vehicle;
  user?: { id: string; name: string };
}

export interface VehicleUsageRecord {
  id: string;
  date: string;
  userId: string;
  userName: string;
  endMileage: number;
  distance: number | null;
  role: DailyRoleType;
}

export interface DailyRoleRecord {
  id: string;
  userId: string;
  date: string;
  role: DailyRoleType;
  user?: { id: string; name: string };
}

export interface DispatchVehicleSummary {
  vehicleId: string;
  plateNumber: string;
  type: VehicleType;
  users: {
    id: string;
    userId: string;
    userName: string;
    role: DailyRoleType;
    endMileage: number;
    distance: number | null;
  }[];
}

export interface DispatchSummary {
  date: string;
  vehicles: DispatchVehicleSummary[];
  usersWithoutVehicle: { userId: string; userName: string; role: DailyRoleType }[];
}

export interface SalarySettings {
  id: number;
  driverBonus: number;
  attendantBonus: number;
  registrationEnabled: boolean;
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
  role: DailyRoleType;
  forwardCount: number;
  reverseCount: number;
  totalCount: number;
  rate: number;
  subtotal: number;
}

export interface SalaryDeductionItem {
  id: string;
  amount: number;
  reason: string;
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
  jobAllowance: number;
  incentiveBonus: number;
  deductions: SalaryDeductionItem[];
  deductionTotal: number;
  totalSalary: number;
}

export interface ReconciliationRecord {
  id: string;
  year: number;
  month: number;
  sourceFileName: string;
  excelForwardCount: number;
  excelReverseCount: number;
  excelRevenueBeforeTax: number;
  systemForwardCount: number;
  systemReverseCount: number;
  systemRevenueBeforeTax: number;
  forwardCountDifference: number;
  reverseCountDifference: number;
  revenueDifference: number;
}

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Announcement {
  id: number;
  content: string;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  createdBy: string;
}

export interface CalendarLeaveEntry {
  id: string;
  userId: string;
  userName: string;
  date: string;
}

export interface CalendarData {
  events: CalendarEvent[];
  leaves: CalendarLeaveEntry[];
}

export interface LeaveRequest {
  id: string;
  userId: string;
  date: string;
  reason: string | null;
  status: LeaveStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user?: { id: string; name: string };
  reviewerName?: string | null;
}

export interface SalaryDeductionRecord {
  id: string;
  year: number;
  month: number;
  amount: number;
  reason: string;
}

export interface TitleOverrideRecord {
  id: string;
  year: number;
  month: number;
  category: TitleCategory;
  level: TitleLevel | null;
}

export interface EmployeeRecordsData {
  user: { id: string; name: string; email: string };
  deliveries: DeliveryRecord[];
  mileages: MileageRecord[];
  dailyRoles: DailyRoleRecord[];
  leaves: LeaveRequest[];
  deductions: SalaryDeductionRecord[];
  titleOverrides: TitleOverrideRecord[];
}

export interface DashboardData {
  year: number;
  month: number;
  isCurrentMonth: boolean;
  today: { forwardTotal: number; reverseTotal: number } | null;
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
  dailyStatus: {
    date: string;
    employees: {
      userId: string;
      name: string;
      role: Role;
      hasRecord: boolean;
      forwardCount: number;
      reverseCount: number;
      note: string | null;
      dailyRole: DailyRoleType | null;
    }[];
  };
  dailyBreakdown: {
    date: string;
    forwardCount: number;
    reverseCount: number;
    totalCount: number;
    salaryCost: number;
    revenue: number | null;
    profit: number | null;
    profitPerItem: number | null;
    attendanceCount: number;
    drivers: string[];
    attendants: string[];
  }[];
  vehicles: VehicleStatus[] | null;
  todayMileage: MileageRecord[] | null;
  alerts: {
    pricingNotSet: boolean;
    unreconciledPreviousMonth: { year: number; month: number } | null;
    vehiclesNeedingMaintenance: VehicleStatus[];
  } | null;
}
