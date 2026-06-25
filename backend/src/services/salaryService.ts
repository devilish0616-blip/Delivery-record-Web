import { prisma } from "../lib/prisma";
import { startOfMonth, startOfNextMonth, toDateOnlyString } from "../utils/date";
import { DailyRoleType } from "@prisma/client";

export type ResolvedTitleCategory = "SENIOR" | "STAFF" | "TEMP" | "CEO" | "SPECIAL";
export type TitleLevel = "HIGH" | "LOW";
export type TitleSource = "AUTO" | "OVERRIDE" | "SPECIAL";

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
  attendanceDays: number; // 當月出勤天數（有送件紀錄的天數）
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
  fuelAllowance: number;         // 當月已核准加油回報加總
  fuelAllowanceItems: FuelAllowanceItem[]; // 明細（供 PDF 顯示）
  parkingFeeAllowance: number;         // 當月已核准停車費回報加總
  parkingFeeAllowanceItems: ParkingFeeAllowanceItem[]; // 明細（供 PDF 顯示）
  deductions: SalaryDeductionItem[];
  deductionTotal: number;
  totalSalary: number;
  formulaNotes: string;
}

// 薪資計算公式設定：可由 ADMIN 透過 /api/settings/salary-formula 調整，
// 以下為尚未設定（資料庫無 SalaryFormulaSettings 紀錄）時的預設值，
// 數值取自系統原本硬寫的計算邏輯，確保未設定前行為不變
export interface SalaryFormulaConfig {
  attendanceThresholds: {
    seniorMinDays: number; // 出勤天數 >= 此值 -> 資深員工
    staffMinDays: number; // 出勤天數 > 此值 -> 員工，否則臨時工
  };
  levelThreshold: {
    highAvgThreshold: number; // 日均件數 > 此值 -> 高件數
  };
  dailyRates: {
    dailyCountBreakpoint: number; // 單日件數 > 此值 -> 採用較高單價
    seniorStaffHigh: { above: number; atOrBelow: number };
    seniorStaffLow: { above: number; atOrBelow: number };
    temp: number;
    special: number; // 執行長 / 特殊職稱固定單價
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

export const DEFAULT_SALARY_FORMULA_CONFIG: SalaryFormulaConfig = {
  attendanceThresholds: { seniorMinDays: 20, staffMinDays: 10 },
  levelThreshold: { highAvgThreshold: 60 },
  dailyRates: {
    dailyCountBreakpoint: 100,
    seniorStaffHigh: { above: 28, atOrBelow: 25 },
    seniorStaffLow: { above: 26, atOrBelow: 23 },
    temp: 23,
    special: 30,
  },
  incentiveBonus: {
    tier1Days: 25,
    tier1Avg: 60,
    tier1Amount: 3000,
    tier2Days: 25,
    tier2Avg: 30,
    tier2Amount: 1500,
  },
  formulaNotes:
    "薪資 = 總件數 × 每件單價 + 司機/隨車加給 + 職務加給 + 激勵獎金 - 扣款。" +
    "職稱依當月出勤天數自動判定（資深員工 / 員工 / 臨時工），" +
    "資深員工與員工再依日平均件數判定為高件數或低件數，" +
    "每件單價依職稱、高低件數與單日件數門檻決定。",
};

// 讀取目前的薪資計算公式設定，若資料庫尚未建立設定則回傳預設值
export async function getSalaryFormulaConfig(): Promise<SalaryFormulaConfig> {
  const settings = await prisma.salaryFormulaSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    return DEFAULT_SALARY_FORMULA_CONFIG;
  }
  return settings.config as unknown as SalaryFormulaConfig;
}

// 需求14：依出勤天數與日均件數判定激勵獎金（IF/ELSE，不會疊加）
export function resolveIncentiveBonus(
  attendanceDays: number,
  averageDailyCount: number,
  config: SalaryFormulaConfig
): number {
  const { tier1Days, tier1Avg, tier1Amount, tier2Days, tier2Avg, tier2Amount } = config.incentiveBonus;
  if (attendanceDays >= tier1Days && averageDailyCount > tier1Avg) {
    return tier1Amount;
  }
  if (attendanceDays >= tier2Days && averageDailyCount > tier2Avg) {
    return tier2Amount;
  }
  return 0;
}

// Step 3：依職稱與當日件數，回傳適用單價（全日同一單價，非分段計算）
export function getDailyRate(
  category: ResolvedTitleCategory,
  level: TitleLevel | null,
  dailyCount: number,
  config: SalaryFormulaConfig
): number {
  const { dailyRates } = config;
  if (category === "CEO" || category === "SPECIAL") return dailyRates.special;
  if (category === "TEMP") return dailyRates.temp;

  // SENIOR / STAFF：依高/低與當日件數決定單價
  if (level === "HIGH") {
    return dailyCount > dailyRates.dailyCountBreakpoint
      ? dailyRates.seniorStaffHigh.above
      : dailyRates.seniorStaffHigh.atOrBelow;
  }
  return dailyCount > dailyRates.dailyCountBreakpoint
    ? dailyRates.seniorStaffLow.above
    : dailyRates.seniorStaffLow.atOrBelow;
}

// Step 1：依當月出勤天數判定職稱大類
export function resolveCategoryByAttendance(
  attendanceDays: number,
  config: SalaryFormulaConfig
): "SENIOR" | "STAFF" | "TEMP" {
  if (attendanceDays >= config.attendanceThresholds.seniorMinDays) return "SENIOR";
  if (attendanceDays > config.attendanceThresholds.staffMinDays) return "STAFF";
  return "TEMP";
}

// Step 2：依日平均件數判定高/低（僅資深員工、員工適用）
export function resolveLevelByAverage(averageDailyCount: number, config: SalaryFormulaConfig): TitleLevel {
  return averageDailyCount > config.levelThreshold.highAvgThreshold ? "HIGH" : "LOW";
}

export async function calculateEmployeeMonthlySalary(
  userId: string,
  year: number,
  month: number,
  formulaConfig?: SalaryFormulaConfig
): Promise<EmployeeMonthlySalary> {
  const config = formulaConfig ?? (await getSalaryFormulaConfig());

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("找不到指定員工");
  }

  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);

  const deliveryRecords = await prisma.deliveryRecord.findMany({
    where: { userId, date: { gte: monthStart, lt: monthEnd } },
    orderBy: { date: "asc" },
  });

  const attendanceDays = deliveryRecords.length;
  const totalDeliveryCount = deliveryRecords.reduce(
    (sum, r) => sum + r.forwardCount + r.reverseCount,
    0
  );
  const averageDailyCount = attendanceDays > 0 ? totalDeliveryCount / attendanceDays : 0;

  let titleCategory: ResolvedTitleCategory;
  let titleLevel: TitleLevel | null = null;
  let titleSource: TitleSource;

  if (user.specialTitle) {
    // 特殊職稱（執行長/特殊）由管理者手動指派，不參與自動判定
    titleCategory = user.specialTitle;
    titleSource = "SPECIAL";
  } else {
    const override = await prisma.employeeTitleOverride.findUnique({
      where: { userId_year_month: { userId, year, month } },
    });

    if (override) {
      titleCategory = override.category;
      titleLevel = override.level as TitleLevel | null;
      titleSource = "OVERRIDE";
    } else {
      titleCategory = resolveCategoryByAttendance(attendanceDays, config);
      titleSource = "AUTO";
    }

    if (
      (titleCategory === "SENIOR" || titleCategory === "STAFF") &&
      titleLevel === null
    ) {
      titleLevel = resolveLevelByAverage(averageDailyCount, config);
    }
  }

  const dailyRoleRecords = await prisma.dailyRoleRecord.findMany({
    where: { userId, date: { gte: monthStart, lt: monthEnd } },
  });
  const roleByDate = new Map(dailyRoleRecords.map((r) => [toDateOnlyString(r.date), r.role]));
  const driverDays = dailyRoleRecords.filter((r) => r.role === "TRUCK_DRIVER").length;
  const attendantDays = dailyRoleRecords.filter((r) => r.role === "TRUCK_ATTENDANT").length;

  const dailyDetails: DailySalaryDetail[] = deliveryRecords.map((r) => {
    const totalCount = r.forwardCount + r.reverseCount;
    const rate = getDailyRate(titleCategory, titleLevel, totalCount, config);
    const date = toDateOnlyString(r.date);
    return {
      date,
      role: roleByDate.get(date) ?? "NONE",
      forwardCount: r.forwardCount,
      reverseCount: r.reverseCount,
      totalCount,
      rate,
      subtotal: totalCount * rate,
    };
  });

  const pieceWorkTotal = dailyDetails.reduce((sum, d) => sum + d.subtotal, 0);

  const salarySettings = await prisma.salarySettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  const driverBonusTotal = driverDays * salarySettings.driverBonus;
  const attendantBonusTotal = attendantDays * salarySettings.attendantBonus;

  const deductionRecords = await prisma.salaryDeduction.findMany({
    where: { userId, year, month },
    orderBy: { createdAt: "asc" },
  });
  const deductions: SalaryDeductionItem[] = deductionRecords.map((d) => ({
    id: d.id,
    amount: d.amount,
    reason: d.reason,
  }));
  const deductionTotal = deductions.reduce((sum, d) => sum + d.amount, 0);

  const jobAllowance = user.monthlyAllowance;
  const incentiveBonus = resolveIncentiveBonus(attendanceDays, averageDailyCount, config);

  // 油資補貼：撈當月已核准的加油回報並加總
  const fuelReportRecords = await prisma.fuelReport.findMany({
    where: { employeeId: userId, status: "APPROVED", date: { gte: monthStart, lt: monthEnd } },
    orderBy: { date: "asc" },
  });
  const fuelAllowanceItems: FuelAllowanceItem[] = fuelReportRecords.map((r) => ({
    id: r.id,
    date: toDateOnlyString(r.date),
    amount: r.amount,
    note: r.note,
  }));
  const fuelAllowance = fuelAllowanceItems.reduce((sum, r) => sum + r.amount, 0);

  // 停車費補貼：撈當月已核准的停車費回報並加總
  const parkingFeeReportRecords = await prisma.parkingFeeReport.findMany({
    where: { employeeId: userId, status: "APPROVED", date: { gte: monthStart, lt: monthEnd } },
    orderBy: { date: "asc" },
  });
  const parkingFeeAllowanceItems: ParkingFeeAllowanceItem[] = parkingFeeReportRecords.map((r) => ({
    id: r.id,
    date: toDateOnlyString(r.date),
    amount: r.amount,
    note: r.note,
  }));
  const parkingFeeAllowance = parkingFeeAllowanceItems.reduce((sum, r) => sum + r.amount, 0);

  return {
    userId: user.id,
    userName: user.name,
    year,
    month,
    attendanceDays,
    totalDeliveryCount,
    averageDailyCount,
    titleCategory,
    titleLevel,
    titleSource,
    dailyDetails,
    pieceWorkTotal,
    driverDays,
    attendantDays,
    driverBonus: salarySettings.driverBonus,
    attendantBonus: salarySettings.attendantBonus,
    driverBonusTotal,
    attendantBonusTotal,
    jobAllowance,
    incentiveBonus,
    fuelAllowance,
    fuelAllowanceItems,
    parkingFeeAllowance,
    parkingFeeAllowanceItems,
    deductions,
    deductionTotal,
    totalSalary:
      pieceWorkTotal +
      driverBonusTotal +
      attendantBonusTotal +
      jobAllowance +
      incentiveBonus +
      fuelAllowance +
      parkingFeeAllowance -
      deductionTotal,
    formulaNotes: config.formulaNotes,
  };
}

export async function calculateAllEmployeesMonthlySalary(
  year: number,
  month: number,
  userIds?: string[]
): Promise<EmployeeMonthlySalary[]> {
  const [users, config] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true, ...(userIds ? { id: { in: userIds } } : {}) } }),
    getSalaryFormulaConfig(),
  ]);
  return Promise.all(users.map((u) => calculateEmployeeMonthlySalary(u.id, year, month, config)));
}
