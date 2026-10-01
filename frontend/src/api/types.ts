export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";
export type VehicleType = "MOTORCYCLE" | "TRUCK";
export type DailyRoleType = "NONE" | "TRUCK_DRIVER" | "TRUCK_ATTENDANT";

// 職務可授予的模組權限鍵
export type Capability = "MANAGE_VEHICLES" | "MANAGE_FINANCE" | "PROXY_DELIVERY";

export interface JobPositionSummary {
  id: string;
  name: string;
  allowance?: number;
}

export interface JobPosition {
  id: string;
  name: string;
  allowance: number;
  capabilities: Capability[];
  isActive: boolean;
  sortOrder: number;
  memberCount: number;
}

// 員工與職務的一筆指派（可複選，各自有任職起始日）
export interface UserJobPositionAssignment {
  id: string;
  name: string;
  allowance: number;
  since: string | null;
}

export interface PayGradeSummary {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  // 代管帳號（由董事長／執行長代填送件）與帳號備註、改名前的原始名稱（僅員工管理 API 提供）
  isProxyManaged?: boolean;
  canLogin?: boolean; // 是否允許本人登入（關閉不影響薪資／代填）
  accountNote?: string | null;
  originalName?: string | null;
  monthlyAllowance?: number;
  jobPositions?: UserJobPositionAssignment[];
  extraCapabilities?: Capability[];
  payGradeId?: string | null;
  payGrade?: PayGradeSummary | null;
  capabilities?: Capability[];
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
  enteredById?: string | null;
  enteredBy?: { id: string; name: string } | null; // 代填者（本人填寫時為 null）
}

// 代填送件：某日期所有代填對象的現況
export interface ProxyDeliveryDay {
  date: string;
  total: number;
  week: { date: string; filled: number }[];
  entries: {
    userId: string;
    name: string;
    accountNote: string | null;
    isProxyManaged: boolean;
    role: DailyRoleType;
    record: {
      forwardCount: number;
      reverseCount: number;
      note: string | null;
      enteredByName: string | null;
      updatedAt: string;
    } | null;
  }[];
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

export type ExpenseCategory = "MAINTENANCE" | "INSURANCE" | "OTHER";

export interface MaintenanceLog {
  id: string;
  date: string;
  mileage: number;
  itemName: string;
  cost: number;
  category: ExpenseCategory;
  vendor: string | null;
  note: string | null;
  createdByName: string | null;
}

export interface MaintenanceLogData {
  logs: MaintenanceLog[];
  summary: { totalCost: number; yearCost: number; monthCost: number; count: number };
}

// 花費總覽：每筆花費明細，FUEL 來自已核准加油回報；分類／期間小計由前端即時彙整
export type ExpenseKind = ExpenseCategory | "FUEL";

export interface VehicleExpenseEntry {
  id: string;
  date: string;
  category: ExpenseKind;
  itemName: string;
  cost: number;
  vendor: string | null;
  note: string | null;
}

export interface VehicleExpenses {
  entries: VehicleExpenseEntry[];
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
  forwardPrice: number; // 正物流每件實拿單價
  reversePrice: number; // 逆物流每件實拿單價
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

// 單價組成的其中一步（固定原始單價，或某一項門檻加給），供「單價建構過程」階梯圖使用
export interface PieceRateBreakdownStep {
  key: string;
  label: string;
  condition: string;
  amount: number;
  hit: boolean;
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
  pieceRate: number; // 當月適用的每件單價（整月固定）
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
  totalSalaryExcludingSubsidy: number;
  formulaNotes: string;
  // 封存於舊快照的紀錄可能沒有此欄位，前端顯示前需檢查是否存在
  rateBreakdown?: PieceRateBreakdownStep[];
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

export interface EmployeeRecordsData {
  user: { id: string; name: string; email: string };
  deliveries: DeliveryRecord[];
  mileages: MileageRecord[];
  dailyRoles: DailyRoleRecord[];
  leaves: LeaveRequest[];
  deductions: SalaryDeductionRecord[];
}

export interface MonthStat {
  forwardCount: number;
  reverseCount: number;
  total: number;
}

export interface EmployeePerformanceStat {
  userId: string;
  name: string;
  months: MonthStat[]; // 索引 0 = 1月 ... 11 = 12月
  yearTotal: MonthStat;
}

export interface EmployeePerformanceData {
  year: number;
  employees: EmployeePerformanceStat[];
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
    forwardPrice: number | null;
    reversePrice: number | null;
  };
  dailyStatus: {
    date: string;
    employees: {
      userId: string;
      name: string;
      role: Role;
      isProxyManaged: boolean;
      hasRecord: boolean;
      enteredByName: string | null;
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
    unlockedSalaryMonth: { year: number; month: number } | null;
    vehiclesNeedingMaintenance: VehicleStatus[];
    vehiclesDocumentDue: VehicleStatus[];
    openRepairCount: number;
    pendingFinanceApprovals: number | null;
  } | null;
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
// 薪資計算公式設定
// ---------------------------------------------------------------------------

export interface SalaryFormulaConfig {
  pieceRate: {
    basePrice: number;
    attendanceBonus: {
      tier1Days: number;
      tier1Bonus: number;
      tier2Days: number;
      tier2Bonus: number;
      tier3Days: number;
      tier3Bonus: number;
    };
    averageCountBonus: { threshold: number; bonus: number };
    totalCountBonus: { threshold: number; bonus: number };
  };
  // 司機／隨車人員每日加給（依今日角色計天數）
  roleBonus: {
    driverDaily: number;
    attendantDaily: number;
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
  id: string | number | null;
  config: SalaryFormulaConfig;
  updatedAt: string | null;
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// 職等：每個職等各自帶一份薪資計算公式，取代全公司共用單一公式
// ---------------------------------------------------------------------------

export interface PayGrade {
  id: string;
  name: string;
  config: SalaryFormulaConfig;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  memberCount: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// 記帳模組（僅 ADMIN）
// ---------------------------------------------------------------------------

export type FinanceRecordType = "INCOME" | "EXPENSE" | "TRANSFER";
export type FinanceCategoryKind = "INCOME" | "EXPENSE";
export type FinanceRecordStatus = "PENDING" | "APPROVED" | "REJECTED";
export type FinanceSourceType =
  | "MANUAL"
  | "IMPORT"
  | "FUEL_REPORT"
  | "PARKING_FEE_REPORT"
  | "MAINTENANCE_LOG"
  | "SALARY_SNAPSHOT";

export interface FinanceParty {
  id: string;
  name: string;
  isShareholder: boolean;
  isActive: boolean;
  sortOrder: number;
}

// 分類在損益表中的歸屬層級（null 時：收入→其他收入、支出→營業費用）
export type FinanceCategoryGroup =
  | "REVENUE"
  | "OTHER_INCOME"
  | "DIRECT_COST"
  | "OPERATING_EXPENSE"
  | "OTHER_EXPENSE";

export interface FinanceCategory {
  id: string;
  kind: FinanceCategoryKind;
  name: string;
  isActive: boolean;
  sortOrder: number;
  group: FinanceCategoryGroup | null;
}

export interface FinanceGroupedProfit {
  revenue: number;
  otherIncome: number;
  directCost: number;
  operatingExpense: number;
  otherExpense: number;
  grossProfit: number; // 營業收入 − 直接成本
  operatingProfit: number; // 毛利 − 營業費用
  net: number;
}

export interface FinanceCategoryBreakdownRow {
  categoryId: string | null;
  categoryName: string;
  kind: FinanceCategoryKind;
  group: FinanceCategoryGroup;
  amount: number;
  prevAmount: number;
  count: number;
}

export interface FinanceOperationsEstimate {
  estimatedRevenue: number | null;
  estimatedSalaryCost: number;
  actualRevenue: number;
  actualSalaryCost: number;
}

export interface FinanceSourceLink {
  id: string;
  sourceType: FinanceSourceType;
  sourceId: string;
  amountAtLink: number;
  sourceLabel: string | null;
}

export interface FinanceRecord {
  id: string;
  date: string;
  type: FinanceRecordType;
  partyId: string;
  party: { id: string; name: string };
  counterPartyId: string | null;
  counterParty: { id: string; name: string } | null;
  categoryId: string | null;
  category: { id: string; kind: FinanceCategoryKind; name: string } | null;
  amount: number;
  note: string | null;
  sourceType: FinanceSourceType;
  status: FinanceRecordStatus;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdBy: { id: string; name: string } | null;
  sourceLinks: FinanceSourceLink[];
}

export interface FinanceSettings {
  id: number;
  fuelPartyId: string | null;
  parkingPartyId: string | null;
  maintenancePartyId: string | null;
  salaryPartyId: string | null;
}

export interface FinanceCategorySummaryRow {
  categoryId: string | null;
  categoryName: string;
  amount: number;
  count: number;
  percent: number;
}

export interface FinanceSettlementRow {
  partyId: string;
  partyName: string;
  advanced: number;
  received: number;
  balance: number;
}

export interface FinanceReportRecordRow {
  id: string;
  date: string;
  type: FinanceRecordType;
  partyName: string;
  counterPartyName: string | null;
  categoryName: string | null;
  amount: number;
  note: string | null;
  sourceType: FinanceSourceType;
}

export interface MonthlyFinanceReport {
  year: number;
  month: number;
  summary: { incomeTotal: number; expenseTotal: number; net: number };
  profit: FinanceGroupedProfit;
  prevProfit: FinanceGroupedProfit;
  categoryBreakdown: FinanceCategoryBreakdownRow[];
  pending: { count: number; amount: number };
  estimate: FinanceOperationsEstimate | null;
  expenseByCategory: FinanceCategorySummaryRow[];
  incomeByCategory: FinanceCategorySummaryRow[];
  records: FinanceReportRecordRow[];
  settlement: FinanceSettlementRow[];
  cumulativeSettlement: FinanceSettlementRow[];
}

export interface YearlyFinanceOverview {
  year: number;
  months: (FinanceGroupedProfit & {
    month: number;
    incomeTotal: number;
    expenseTotal: number;
    recordCount: number;
  })[];
  total: FinanceGroupedProfit & { incomeTotal: number; expenseTotal: number };
}

export interface FinanceImportSourceItem {
  sourceId: string;
  date: string;
  amount: number;
  label: string;
  note: string | null;
  categoryName?: string;
  vehicleId?: string | null;
  vehicleLabel?: string | null;
  employeeId?: string;
  resolvedPartyId?: string | null;
  reason?: string | null;
}

export interface EmployeeResponsibleParty {
  userId: string;
  userName: string;
  responsiblePartyId: string | null;
}

export interface FinanceImportBlockStatus {
  sourceCount: number;
  sourceTotal: number;
  importedCount: number;
  importedTotal: number;
  pending: FinanceImportSourceItem[];
  pendingTotal: number;
  ignored: FinanceImportSourceItem[];
  ignoredTotal: number;
  defaultPartyId: string | null;
  extra?: { monthLocked?: boolean };
}

export interface FinanceQuickImportBlockResult {
  imported: boolean;
  count: number;
  totalAmount: number;
  error: string | null;
  skipReason: string | null;
}

export interface FinanceQuickImportMaintenancePendingInfo {
  count: number;
  totalAmount: number;
}

export interface FinanceQuickImportResult {
  salary: FinanceQuickImportBlockResult;
  fuel: FinanceQuickImportBlockResult;
  parking: FinanceQuickImportBlockResult;
  maintenance: FinanceQuickImportBlockResult;
  maintenancePending: FinanceQuickImportMaintenancePendingInfo;
}

// 一鍵帶入預覽：將建立的帳目（不寫入）
export interface FinanceQuickImportPreview {
  entries: {
    block: "salary" | "fuel" | "parking" | "maintenance";
    categoryName: string;
    label: string;
    partyId: string | null;
    partyName: string | null;
    recordCount: number;
    sourceCount: number;
    amount: number;
  }[];
  skipped: { block: string; label: string; reason: string }[];
  problems: string[];
  totalAmount: number;
  totalRecords: number;
}

// 最近月份帶入進度
export interface FinanceMonthImportSummary {
  year: number;
  month: number;
  sourceCount: number;
  pendingCount: number;
  pendingTotal: number;
  salaryLocked: boolean;
}

export interface FinanceSourceWarning {
  recordId: string;
  recordNote: string | null;
  sourceType: FinanceSourceType;
  sourceLabel: string | null;
  message: string;
  syncable: boolean; // 金額變更可一鍵改成來源金額
}

export interface FinanceImportCenterStatus {
  year: number;
  month: number;
  fuel: FinanceImportBlockStatus;
  parking: FinanceImportBlockStatus;
  maintenance: FinanceImportBlockStatus;
  salary: FinanceImportBlockStatus;
  warnings: FinanceSourceWarning[];
}

export interface FinanceFundBalanceRow {
  partyId: string;
  partyName: string;
  balance: number;
}

export interface FinanceAllTimeOverview {
  firstDate: string | null;
  lastDate: string | null;
  recordCount: number;
  summary: { incomeTotal: number; expenseTotal: number; net: number };
  settlement: FinanceSettlementRow[];
  funds: FinanceFundBalanceRow[];
  expenseByCategory: FinanceCategorySummaryRow[];
  incomeByCategory: FinanceCategorySummaryRow[];
}
