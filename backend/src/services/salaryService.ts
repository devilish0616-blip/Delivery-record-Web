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
  deductions: SalaryDeductionItem[];
  deductionTotal: number;
  totalSalary: number;
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

  const dispatchRecords = await prisma.dispatchRecord.findMany({
    where: {
      date: { gte: monthStart, lt: monthEnd },
      OR: [{ driverId: userId }, { attendantId: userId }],
    },
  });
  const driverDays = dispatchRecords.filter((d) => d.driverId === userId).length;
  const attendantDays = dispatchRecords.filter((d) => d.attendantId === userId).length;

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
    deductions,
    deductionTotal,
    totalSalary: pieceWorkTotal + driverBonusTotal + attendantBonusTotal - deductionTotal,
  };
}

export async function calculateAllEmployeesMonthlySalary(
  year: number,
  month: number
): Promise<EmployeeMonthlySalary[]> {
  const users = await prisma.user.findMany({ where: { isActive: true } });
  return Promise.all(users.map((u) => calculateEmployeeMonthlySalary(u.id, year, month)));
}
