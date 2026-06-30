export type Role = "ADMIN" | "MANAGER" | "REGION_MANAGER" | "EMPLOYEE";
export type VehicleType = "MOTORCYCLE" | "TRUCK";
export type DailyRoleType = "NONE" | "TRUCK_DRIVER" | "TRUCK_ATTENDANT";
export type SpecialTitle = "CEO" | "SPECIAL";
export type TitleCategory = "SENIOR" | "STAFF" | "TEMP";
export type ResolvedTitleCategory = TitleCategory | SpecialTitle;
export type TitleLevel = "HIGH" | "LOW";
export type TitleSource = "AUTO" | "OVERRIDE" | "SPECIAL";

export interface UserRegionSummary {
  id: string;
  name: string;
  isManager: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  specialTitle: SpecialTitle | null;
  isActive: boolean;
  monthlyAllowance?: number;
  createdAt?: string;
  regions?: UserRegionSummary[];
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
  intervalDays: number | null;
  lastChangeMileage: number;
  lastChangeNote: string | null;
  lastChangeAt: string | null;
  sinceLastChange: number;
  remaining: number;
  remainingDays: number | null;
  needsChange: boolean;
  warning: boolean;
}

export type DocumentKey =
  | "insuranceCompulsoryExpiry"
  | "insuranceLiabilityExpiry"
  | "inspectionExpiry"
  | "licenseTaxDueDate"
  | "fuelTaxDueDate";

export interface DocumentStatus {
  key: DocumentKey;
  label: string;
  date: string | null;
  daysUntil: number | null;
  expired: boolean;
  expiring: boolean;
}

export interface VehicleStatus extends Vehicle {
  insuranceCompulsoryExpiry: string | null;
  insuranceLiabilityExpiry: string | null;
  inspectionExpiry: string | null;
  licenseTaxDueDate: string | null;
  fuelTaxDueDate: string | null;
  maintenanceItems: MaintenanceItemStatus[];
  documents: DocumentStatus[];
  needsMaintenance: boolean;
  maintenanceWarning: boolean;
  documentExpired: boolean;
  documentExpiring: boolean;
  openRepairCount: number;
}

export interface MaintenanceLog {
  id: string;
  date: string;
  mileage: number;
  itemName: string;
  cost: number;
  vendor: string | null;
  note: string | null;
  createdByName: string | null;
}

export interface MaintenanceLogData {
  logs: MaintenanceLog[];
  summary: { totalCost: number; yearCost: number; monthCost: number; count: number };
}

export type RepairRequestStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export interface RepairRequest {
  id: string;
  vehicleId: string;
  description: string;
  status: RepairRequestStatus;
  reportedById: string;
  handledById: string | null;
  handledAt: string | null;
  resolveNote: string | null;
  createdAt: string;
  updatedAt: string;
  vehicle?: { id: string; plateNumber: string; type: VehicleType };
  reportedBy?: { id: string; name: string };
  handledBy?: { id: string; name: string } | null;
}

export interface VehicleAlerts {
  maintenance: {
    vehicleId: string;
    plateNumber: string;
    items: { itemName: string; needsChange: boolean; remaining: number; remainingDays: number | null }[];
  }[];
  documents: {
    vehicleId: string;
    plateNumber: string;
    docs: { label: string; date: string | null; daysUntil: number | null; expired: boolean }[];
  }[];
  repairs: { vehicleId: string; plateNumber: string; openRepairCount: number }[];
  counts: { maintenance: number; documents: number; repairs: number };
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
  salaryLockGraceDay: number;
}

// 全員薪資查詢回應：已封存月份 salaries 取自快照
export interface MonthlySalaryResponse {
  locked: boolean;
  lockedAt: string | null;
  salaries: EmployeeMonthlySalary[];
}

// 某月份薪資封存狀態
export interface SalaryLockStatus {
  year: number;
  month: number;
  locked: boolean;
  lockedAt: string | null;
  lockedByName: string | null;
  note: string | null;
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

export interface FuelAllowanceItem {
  id: string;
  date: string;
  amount: number;
  note: string | null;
}

export interface ParkingFeeAllowanceItem {
  id: string;
  date: string;
  amount: number;
  note: string | null;
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
  fuelAllowance: number;
  fuelAllowanceItems: FuelAllowanceItem[];
  parkingFeeAllowance: number;
  parkingFeeAllowanceItems: ParkingFeeAllowanceItem[];
  deductions: SalaryDeductionItem[];
  deductionTotal: number;
  totalSalary: number;
  formulaNotes: string;
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
    unlockedSalaryMonth: { year: number; month: number } | null;
    vehiclesNeedingMaintenance: VehicleStatus[];
    vehiclesDocumentDue: VehicleStatus[];
    openRepairCount: number;
  } | null;
}

// ---------------------------------------------------------------------------
// 區域主管系統
// ---------------------------------------------------------------------------

export interface RegionListItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  memberCount: number;
  managers: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface RegionMemberItem {
  userId: string;
  userName: string;
  email: string;
  role: Role;
  isActive: boolean;
  isManager: boolean;
}

export interface MyRegion {
  id: string;
  name: string;
  description: string | null;
  members: {
    userId: string;
    userName: string;
    role: Role;
    isActive: boolean;
    isManager: boolean;
  }[];
}

export interface MyRegionsData {
  regions: MyRegion[];
}

export interface RegionDailyStatusMember {
  userId: string;
  userName: string;
  hasSubmitted: boolean;
  forwardCount: number;
  reverseCount: number;
  role: DailyRoleType;
}

export interface RegionDailyStatus {
  date: string;
  members: RegionDailyStatusMember[];
}

// ---------------------------------------------------------------------------
// 加油回報系統
// ---------------------------------------------------------------------------

export type FuelReportStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface FuelReport {
  id: string;
  date: string;
  amount: number;
  note: string | null;
  status: FuelReportStatus;
  employeeId: string;
  vehicleId: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: { id: string; name: string };
  reviewedBy?: { id: string; name: string } | null;
  vehicle?: { id: string; plateNumber: string; type: VehicleType } | null;
}

// ---------------------------------------------------------------------------
// 停車費回報系統
// ---------------------------------------------------------------------------

export type ParkingFeeReportStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ParkingFeeReport {
  id: string;
  date: string;
  amount: number;
  note: string | null;
  status: ParkingFeeReportStatus;
  employeeId: string;
  vehicleId: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: { id: string; name: string };
  reviewedBy?: { id: string; name: string } | null;
  vehicle?: { id: string; plateNumber: string; type: VehicleType } | null;
}

// ---------------------------------------------------------------------------
// 排班系統
// ---------------------------------------------------------------------------

export interface Schedule {
  id: string;
  date: string;
  subArea: string;
  note: string | null;
  employeeId: string;
  regionId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  employee?: { id: string; name: string };
  region?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string };
}

// ---------------------------------------------------------------------------
// 薪資計算公式設定
// ---------------------------------------------------------------------------

export interface SalaryFormulaConfig {
  attendanceThresholds: {
    seniorMinDays: number;
    staffMinDays: number;
  };
  levelThreshold: {
    highAvgThreshold: number;
  };
  dailyRates: {
    dailyCountBreakpoint: number;
    seniorStaffHigh: { above: number; atOrBelow: number };
    seniorStaffLow: { above: number; atOrBelow: number };
    temp: number;
    special: number;
  };
  incentiveBonus: {
    tier1Days: number;
    tier1Avg: number;
    tier1Amount: number;
    tier2Days: number;
    tier2Avg: number;
    tier2Amount: number;
  };
  formulaNotes: string;
}

export interface SalaryFormulaSettings {
  id: number;
  config: SalaryFormulaConfig;
  updatedAt: string | null;
  updatedBy: string | null;
}
