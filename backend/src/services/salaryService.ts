import { prisma } from "../lib/prisma";
import { startOfMonth, startOfNextMonth, toDateOnlyString } from "../utils/date";

export type ResolvedTitleCategory = "SENIOR" | "STAFF" | "TEMP" | "CEO" | "SPECIAL";
export type TitleLevel = "HIGH" | "LOW";
export type TitleSource = "AUTO" | "OVERRIDE" | "SPECIAL";

export interface DailySalaryDetail {
  date: string;
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
  deductions: SalaryDeductionItem[];
  deductionTotal: number;
  totalSalary: number;
}

const INCENTIVE_ATTENDANCE_THRESHOLD = 25; // 激勵獎金最低出勤天數
const INCENTIVE_HIGH_AVG_THRESHOLD = 60; // 日均件數 > 60 -> 3000
const INCENTIVE_LOW_AVG_THRESHOLD = 30; // 日均件數 > 30 -> 1500
const INCENTIVE_HIGH_BONUS = 3000;
const INCENTIVE_LOW_BONUS = 1500;

// 需求14：依出勤天數與日均件數判定激勵獎金（IF/ELSE，不會疊加）
export function resolveIncentiveBonus(attendanceDays: number, averageDailyCount: number): number {
  if (attendanceDays >= INCENTIVE_ATTENDANCE_THRESHOLD && averageDailyCount > INCENTIVE_HIGH_AVG_THRESHOLD) {
    return INCENTIVE_HIGH_BONUS;
  }
  if (attendanceDays >= INCENTIVE_ATTENDANCE_THRESHOLD && averageDailyCount > INCENTIVE_LOW_AVG_THRESHOLD) {
    return INCENTIVE_LOW_BONUS;
  }
  return 0;
}

const HIGH_LOW_THRESHOLD = 60; // 日平均件數判定高/低門檻
const DAILY_COUNT_BREAKPOINT = 100; // 單日件數判定單價門檻

// Step 3：依職稱與當日件數，回傳適用單價（全日同一單價，非分段計算）
export function getDailyRate(
  category: ResolvedTitleCategory,
  level: TitleLevel | null,
  dailyCount: number
): number {
  if (category === "CEO" || category === "SPECIAL") return 30;
  if (category === "TEMP") return 23;

  // SENIOR / STAFF：依高/低與當日件數決定單價
  if (level === "HIGH") {
    return dailyCount > DAILY_COUNT_BREAKPOINT ? 28 : 25;
  }
  return dailyCount > DAILY_COUNT_BREAKPOINT ? 26 : 23;
}

// Step 1：依當月出勤天數判定職稱大類
export function resolveCategoryByAttendance(attendanceDays: number): "SENIOR" | "STAFF" | "TEMP" {
  if (attendanceDays >= 20) return "SENIOR";
  if (attendanceDays > 10) return "STAFF";
  return "TEMP";
}

// Step 2：依日平均件數判定高/低（僅資深員工、員工適用）
export function resolveLevelByAverage(averageDailyCount: number): TitleLevel {
  return averageDailyCount > HIGH_LOW_THRESHOLD ? "HIGH" : "LOW";
}

export async function calculateEmployeeMonthlySalary(
  userId: string,
  year: number,
  month: number
): Promise<EmployeeMonthlySalary> {
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
      titleCategory = resolveCategoryByAttendance(attendanceDays);
      titleSource = "AUTO";
    }

    if (
      (titleCategory === "SENIOR" || titleCategory === "STAFF") &&
      titleLevel === null
    ) {
      titleLevel = resolveLevelByAverage(averageDailyCount);
    }
  }

  const dailyDetails: DailySalaryDetail[] = deliveryRecords.map((r) => {
    const totalCount = r.forwardCount + r.reverseCount;
    const rate = getDailyRate(titleCategory, titleLevel, totalCount);
    return {
      date: toDateOnlyString(r.date),
      forwardCount: r.forwardCount,
      reverseCount: r.reverseCount,
      totalCount,
      rate,
      subtotal: totalCount * rate,
    };
  });

  const pieceWorkTotal = dailyDetails.reduce((sum, d) => sum + d.subtotal, 0);

  const dailyRoleRecords = await prisma.dailyRoleRecord.findMany({
    where: {
      userId,
      date: { gte: monthStart, lt: monthEnd },
      role: { in: ["DRIVER", "ATTENDANT"] },
    },
  });
  const driverDays = dailyRoleRecords.filter((r) => r.role === "DRIVER").length;
  const attendantDays = dailyRoleRecords.filter((r) => r.role === "ATTENDANT").length;

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
  const incentiveBonus = resolveIncentiveBonus(attendanceDays, averageDailyCount);

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
    deductions,
    deductionTotal,
    totalSalary:
      pieceWorkTotal +
      driverBonusTotal +
      attendantBonusTotal +
      jobAllowance +
      incentiveBonus -
      deductionTotal,
  };
}

export async function calculateAllEmployeesMonthlySalary(
  year: number,
  month: number
): Promise<EmployeeMonthlySalary[]> {
  const users = await prisma.user.findMany({ where: { isActive: true } });
  return Promise.all(users.map((u) => calculateEmployeeMonthlySalary(u.id, year, month)));
}
