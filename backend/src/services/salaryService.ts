import { prisma } from "../lib/prisma";
import { startOfMonth, startOfNextMonth, toDateOnlyString } from "../utils/date";
import { DailyRoleType, Prisma } from "@prisma/client";

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

// 純計算：給定某員工當月已撈出的各項原始資料，組裝出薪資結果。
// 不做任何資料庫查詢，供「單一員工」與「批次」兩條路徑共用，
// 確保兩者的加總邏輯永遠一致。
interface SalaryComputationInput {
  user: { id: string; name: string; specialTitle: ResolvedTitleCategory | null };
  year: number;
  month: number;
  config: SalaryFormulaConfig;
  // 固定職務加給：由員工指派之啟用中職務的金額決定（無職務則為 0），無條件加總
  jobAllowance: number;
  driverBonus: number;
  attendantBonus: number;
  deliveryRecords: { date: Date; forwardCount: number; reverseCount: number }[];
  dailyRoleRecords: { date: Date; role: DailyRoleType }[];
  override: { category: ResolvedTitleCategory; level: string | null } | null;
  deductionRecords: { id: string; amount: number; reason: string }[];
  fuelReportRecords: { id: string; date: Date; amount: number; note: string | null }[];
  parkingFeeReportRecords: { id: string; date: Date; amount: number; note: string | null }[];
}

export function assembleEmployeeSalary(input: SalaryComputationInput): EmployeeMonthlySalary {
  const {
    user,
    year,
    month,
    config,
    jobAllowance,
    driverBonus,
    attendantBonus,
    deliveryRecords,
    dailyRoleRecords,
    override,
    deductionRecords,
    fuelReportRecords,
    parkingFeeReportRecords,
  } = input;

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
  } else if (override) {
    titleCategory = override.category;
    titleLevel = override.level as TitleLevel | null;
    titleSource = "OVERRIDE";
  } else {
    titleCategory = resolveCategoryByAttendance(attendanceDays, config);
    titleSource = "AUTO";
  }

  if ((titleCategory === "SENIOR" || titleCategory === "STAFF") && titleLevel === null) {
    titleLevel = resolveLevelByAverage(averageDailyCount, config);
  }

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
  const driverBonusTotal = driverDays * driverBonus;
  const attendantBonusTotal = attendantDays * attendantBonus;

  const deductions: SalaryDeductionItem[] = deductionRecords.map((d) => ({
    id: d.id,
    amount: d.amount,
    reason: d.reason,
  }));
  const deductionTotal = deductions.reduce((sum, d) => sum + d.amount, 0);

  const incentiveBonus = resolveIncentiveBonus(attendanceDays, averageDailyCount, config);

  const fuelAllowanceItems: FuelAllowanceItem[] = fuelReportRecords.map((r) => ({
    id: r.id,
    date: toDateOnlyString(r.date),
    amount: r.amount,
    note: r.note,
  }));
  const fuelAllowance = fuelAllowanceItems.reduce((sum, r) => sum + r.amount, 0);

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
    driverBonus,
    attendantBonus,
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

export async function calculateEmployeeMonthlySalary(
  userId: string,
  year: number,
  month: number,
  formulaConfig?: SalaryFormulaConfig
): Promise<EmployeeMonthlySalary> {
  const config = formulaConfig ?? (await getSalaryFormulaConfig());

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { jobPosition: { select: { allowance: true, isActive: true } } },
  });
  if (!user) {
    throw new Error("找不到指定員工");
  }
  const jobAllowance = user.jobPosition && user.jobPosition.isActive ? user.jobPosition.allowance : 0;

  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);
  const dateRange = { gte: monthStart, lt: monthEnd };

  // 單一員工各項資料一次併發撈出（彼此無相依），再交由 assembleEmployeeSalary 組裝
  const [
    deliveryRecords,
    dailyRoleRecords,
    override,
    salarySettings,
    deductionRecords,
    fuelReportRecords,
    parkingFeeReportRecords,
  ] = await Promise.all([
    prisma.deliveryRecord.findMany({ where: { userId, date: dateRange }, orderBy: { date: "asc" } }),
    prisma.dailyRoleRecord.findMany({ where: { userId, date: dateRange } }),
    user.specialTitle
      ? Promise.resolve(null)
      : prisma.employeeTitleOverride.findUnique({
          where: { userId_year_month: { userId, year, month } },
        }),
    prisma.salarySettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.salaryDeduction.findMany({ where: { userId, year, month }, orderBy: { createdAt: "asc" } }),
    prisma.fuelReport.findMany({
      where: { employeeId: userId, status: "APPROVED", date: dateRange },
      orderBy: { date: "asc" },
    }),
    prisma.parkingFeeReport.findMany({
      where: { employeeId: userId, status: "APPROVED", date: dateRange },
      orderBy: { date: "asc" },
    }),
  ]);

  return assembleEmployeeSalary({
    user,
    year,
    month,
    config,
    jobAllowance,
    driverBonus: salarySettings.driverBonus,
    attendantBonus: salarySettings.attendantBonus,
    deliveryRecords,
    dailyRoleRecords,
    override,
    deductionRecords,
    fuelReportRecords,
    parkingFeeReportRecords,
  });
}

export async function calculateAllEmployeesMonthlySalary(
  year: number,
  month: number,
  userIds?: string[]
): Promise<EmployeeMonthlySalary[]> {
  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);
  const dateRange = { gte: monthStart, lt: monthEnd };

  // 1) 先撈出符合條件的員工 + 公式設定 + 薪資加給設定（整批僅一次，避免每位員工重複 upsert）
  const [users, config, salarySettings] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, ...(userIds ? { id: { in: userIds } } : {}) },
      include: { jobPosition: { select: { allowance: true, isActive: true } } },
    }),
    getSalaryFormulaConfig(),
    prisma.salarySettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ]);

  if (users.length === 0) {
    return [];
  }

  const ids = users.map((u) => u.id);

  // 2) 各類紀錄以 userId in [...] 一次撈齊（取代「每位員工各 N 次查詢」的 N+1）
  const [deliveries, dailyRoles, overrides, deductions, fuelReports, parkingFeeReports] =
    await Promise.all([
      prisma.deliveryRecord.findMany({
        where: { userId: { in: ids }, date: dateRange },
        orderBy: { date: "asc" },
      }),
      prisma.dailyRoleRecord.findMany({ where: { userId: { in: ids }, date: dateRange } }),
      prisma.employeeTitleOverride.findMany({ where: { userId: { in: ids }, year, month } }),
      prisma.salaryDeduction.findMany({
        where: { userId: { in: ids }, year, month },
        orderBy: { createdAt: "asc" },
      }),
      prisma.fuelReport.findMany({
        where: { employeeId: { in: ids }, status: "APPROVED", date: dateRange },
        orderBy: { date: "asc" },
      }),
      prisma.parkingFeeReport.findMany({
        where: { employeeId: { in: ids }, status: "APPROVED", date: dateRange },
        orderBy: { date: "asc" },
      }),
    ]);

  // 3) 以 userId 分組，組裝每位員工的薪資（已撈出的資料順序維持 orderBy）
  const groupByUser = <T,>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = keyOf(row);
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return map;
  };

  const deliveriesByUser = groupByUser(deliveries, (r) => r.userId);
  const dailyRolesByUser = groupByUser(dailyRoles, (r) => r.userId);
  const deductionsByUser = groupByUser(deductions, (r) => r.userId);
  const fuelByUser = groupByUser(fuelReports, (r) => r.employeeId);
  const parkingByUser = groupByUser(parkingFeeReports, (r) => r.employeeId);
  const overrideByUser = new Map(overrides.map((o) => [o.userId, o]));

  return users.map((user) =>
    assembleEmployeeSalary({
      user,
      year,
      month,
      config,
      jobAllowance: user.jobPosition && user.jobPosition.isActive ? user.jobPosition.allowance : 0,
      driverBonus: salarySettings.driverBonus,
      attendantBonus: salarySettings.attendantBonus,
      deliveryRecords: deliveriesByUser.get(user.id) ?? [],
      dailyRoleRecords: dailyRolesByUser.get(user.id) ?? [],
      override: overrideByUser.get(user.id) ?? null,
      deductionRecords: deductionsByUser.get(user.id) ?? [],
      fuelReportRecords: fuelByUser.get(user.id) ?? [],
      parkingFeeReportRecords: parkingByUser.get(user.id) ?? [],
    })
  );
}

// ---------------------------------------------------------------------------
// 薪資封存（B 方案：快照）
//
// 封存後該月薪資以 SalarySnapshot 為準，日後資料補登或公式變動皆不影響歷史帳。
// 讀取一律走 getEmployeeMonthlySalary / getAllEmployeesMonthlySalary：
//   已封存 → 回傳快照；未封存 → 即時計算（行為與封存前完全相同）。
// ---------------------------------------------------------------------------

export type SalaryMonthLock = {
  year: number;
  month: number;
  lockedAt: Date;
  lockedById: string | null;
  note: string | null;
};

// 取得某月份封存鎖（null 表示未封存）
export async function getSalaryMonthLock(year: number, month: number): Promise<SalaryMonthLock | null> {
  return prisma.salaryMonthLock.findUnique({ where: { year_month: { year, month } } });
}

// 讀取單一員工某月薪資：已封存回快照、未封存即時計算
export async function getEmployeeMonthlySalary(
  userId: string,
  year: number,
  month: number
): Promise<EmployeeMonthlySalary> {
  const lock = await getSalaryMonthLock(year, month);
  if (lock) {
    const snapshot = await prisma.salarySnapshot.findUnique({
      where: { userId_year_month: { userId, year, month } },
    });
    // 封存後才建立的帳號可能沒有快照，退回即時計算以免報錯
    if (snapshot) {
      return snapshot.data as unknown as EmployeeMonthlySalary;
    }
  }
  return calculateEmployeeMonthlySalary(userId, year, month);
}

export interface MonthlySalaryReadModel {
  locked: boolean;
  lockedAt: string | null;
  salaries: EmployeeMonthlySalary[];
}

// 讀取整月全員薪資：已封存回快照清單、未封存即時計算
export async function getAllEmployeesMonthlySalary(
  year: number,
  month: number,
  userIds?: string[]
): Promise<MonthlySalaryReadModel> {
  const lock = await getSalaryMonthLock(year, month);
  if (lock) {
    const snapshots = await prisma.salarySnapshot.findMany({
      where: { year, month, ...(userIds ? { userId: { in: userIds } } : {}) },
    });
    return {
      locked: true,
      lockedAt: lock.lockedAt.toISOString(),
      salaries: snapshots.map((s) => s.data as unknown as EmployeeMonthlySalary),
    };
  }
  const salaries = await calculateAllEmployeesMonthlySalary(year, month, userIds);
  return { locked: false, lockedAt: null, salaries };
}

// 封存某月薪資：以即時計算結果寫入快照，並建立/更新封存鎖（可重複封存覆蓋）
export async function lockSalaryMonth(
  year: number,
  month: number,
  lockedById: string,
  note?: string | null
): Promise<{ count: number; lockedAt: string }> {
  const salaries = await calculateAllEmployeesMonthlySalary(year, month);
  const lockedAt = new Date();

  await prisma.$transaction([
    ...salaries.map((s) =>
      prisma.salarySnapshot.upsert({
        where: { userId_year_month: { userId: s.userId, year, month } },
        update: { data: s as unknown as Prisma.InputJsonValue },
        create: { userId: s.userId, year, month, data: s as unknown as Prisma.InputJsonValue },
      })
    ),
    prisma.salaryMonthLock.upsert({
      where: { year_month: { year, month } },
      update: { lockedById, note: note ?? null, lockedAt },
      create: { year, month, lockedById, note: note ?? null, lockedAt },
    }),
  ]);

  return { count: salaries.length, lockedAt: lockedAt.toISOString() };
}

// 解除某月封存：刪除封存鎖與快照，恢復即時計算
export async function unlockSalaryMonth(year: number, month: number): Promise<void> {
  await prisma.$transaction([
    prisma.salarySnapshot.deleteMany({ where: { year, month } }),
    prisma.salaryMonthLock.deleteMany({ where: { year, month } }),
  ]);
}
