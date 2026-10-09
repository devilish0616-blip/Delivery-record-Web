import { prisma } from "../lib/prisma";
import { startOfMonth, startOfNextMonth, taipeiParts, toDateOnlyString } from "../utils/date";
import { DailyRoleType, Prisma } from "@prisma/client";

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
  // 上月補報：回報日期所在月份（YYYY-MM）已封存，改計入本月；一般為 null。舊快照沒有此欄位
  carriedFrom?: string | null;
}

export interface ParkingFeeAllowanceItem {
  id: string;
  date: string;
  amount: number;
  note: string | null;
  carriedFrom?: string | null;
}

export interface SalaryAdditionItem {
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
  pieceRate: number; // 當月適用的每件單價（固定原始單價 + 出勤/日均件數/總件數加給疊加後的結果，整月固定）
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
  // 加項（一次性獎金、補發、代墊還款…）；舊快照沒有此欄位，讀取時補成空陣列與 0
  additions: SalaryAdditionItem[];
  additionTotal: number;
  // 帳號已停用，但當月有紀錄（例如月中離職），仍要算薪資
  inactive?: boolean;
  totalSalary: number;
  // 未含油資／停車費補貼的總數（＝ totalSalary − fuelAllowance − parkingFeeAllowance）
  totalSalaryExcludingSubsidy: number;
  formulaNotes: string;
  // 單價逐步疊加明細（固定原始單價 + 各項門檻加給是否達標），供前端畫「單價建構過程」用；
  // 封存於舊快照的紀錄可能沒有此欄位，前端需視為可選
  rateBreakdown: PieceRateBreakdownStep[];
  // 激勵獎金兩階的門檻與是否達標（我的薪資「還差多少」用）；舊快照沒有此欄位
  incentiveTiers?: IncentiveTierProgress[];
}

// 激勵獎金其中一階：出勤 ≥ days 天且日均 > avg 件可得 amount（兩階擇高，不疊加）
export interface IncentiveTierProgress {
  days: number;
  avg: number;
  amount: number;
  hit: boolean;
}

// 單價組成的其中一步（固定原始單價，或某一項門檻加給）
export interface PieceRateBreakdownStep {
  key: string;
  label: string;
  condition: string; // 達標條件的文字說明，固定原始單價本身無條件故為空字串
  amount: number; // 該步驟貢獻的金額（未達標時仍回傳門檻設定的數值，由 hit 決定是否計入）
  hit: boolean;
  // 進度：這項加給看的是出勤天數／日均件數／總件數，目前值與門檻（固定原始單價沒有門檻故省略）。
  // strict＝需「超過」門檻才算（日均件數），否則「達到」即可；舊快照沒有這些欄位
  metric?: "days" | "avg" | "total";
  current?: number;
  target?: number;
  strict?: boolean;
}

// 薪資計算公式設定：可由 ADMIN 透過 /api/settings/salary-formula 調整，
// 以下為尚未設定（資料庫無 SalaryFormulaSettings 紀錄）時的預設值，
// 數值取自系統原本硬寫的計算邏輯，確保未設定前行為不變
export interface SalaryFormulaConfig {
  pieceRate: {
    basePrice: number; // 固定原始單價
    attendanceBonus: {
      tier1Days: number; // 出勤天數 >= 此值 -> +tier1Bonus
      tier1Bonus: number;
      tier2Days: number; // 出勤天數 >= 此值 -> 再疊加 +tier2Bonus
      tier2Bonus: number;
      tier3Days: number; // 出勤天數 >= 此值 -> 再疊加 +tier3Bonus
      tier3Bonus: number;
    };
    averageCountBonus: { threshold: number; bonus: number }; // 日均件數 > threshold -> +bonus
    totalCountBonus: { threshold: number; bonus: number }; // 當月總件數 >= threshold -> +bonus
  };
  // 司機／隨車人員每日加給（依今日角色計天數），隨職等各自設定
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

export const DEFAULT_SALARY_FORMULA_CONFIG: SalaryFormulaConfig = {
  pieceRate: {
    basePrice: 23,
    attendanceBonus: {
      tier1Days: 15,
      tier1Bonus: 1,
      tier2Days: 20,
      tier2Bonus: 0.5,
      tier3Days: 25,
      tier3Bonus: 0.5,
    },
    averageCountBonus: { threshold: 60, bonus: 1 },
    totalCountBonus: { threshold: 2000, bonus: 1 },
  },
  roleBonus: { driverDaily: 1000, attendantDaily: 500 },
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
    "每件單價 = 固定原始單價，並依當月出勤天數（達門檻逐階疊加）、日均件數（達門檻加給）、" +
    "當月總件數（達門檻加給）三項條件疊加加給，整月固定套用同一單價。",
};

// 讀取「預設職等」的公式設定（未指派職等的員工套用此設定）；
// 若資料庫連預設職等都沒有（理論上不會發生，遷移時已建立），回傳系統原始預設值
export async function getSalaryFormulaConfig(): Promise<SalaryFormulaConfig> {
  const defaultGrade = await prisma.payGrade.findFirst({ where: { isDefault: true } });
  if (!defaultGrade) {
    return DEFAULT_SALARY_FORMULA_CONFIG;
  }
  return withRoleBonus(defaultGrade.config);
}

// 職等公式 JSON 轉型；缺少 roleBonus（理論上 migration 已補齊）時以系統預設值補上，避免司機／隨車加給算成 NaN
function withRoleBonus(config: unknown): SalaryFormulaConfig {
  const c = config as SalaryFormulaConfig;
  return c.roleBonus ? c : { ...c, roleBonus: DEFAULT_SALARY_FORMULA_CONFIG.roleBonus };
}

// 依員工指派的職等解析生效公式：職等存在且啟用中則用其公式，否則採用預設職等（沿用同一份 defaultConfig，避免重複查詢）
function resolvePayGradeConfig(
  payGrade: { config: unknown; isActive: boolean } | null,
  defaultConfig: SalaryFormulaConfig
): SalaryFormulaConfig {
  if (payGrade && payGrade.isActive) {
    return withRoleBonus(payGrade.config);
  }
  return defaultConfig;
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

// 依出勤天數（三階疊加）、日均件數、當月總件數，算出整月固定套用的每件單價
export function resolvePieceRate(
  attendanceDays: number,
  averageDailyCount: number,
  totalDeliveryCount: number,
  config: SalaryFormulaConfig
): number {
  const { basePrice, attendanceBonus, averageCountBonus, totalCountBonus } = config.pieceRate;
  let rate = basePrice;
  if (attendanceDays >= attendanceBonus.tier1Days) rate += attendanceBonus.tier1Bonus;
  if (attendanceDays >= attendanceBonus.tier2Days) rate += attendanceBonus.tier2Bonus;
  if (attendanceDays >= attendanceBonus.tier3Days) rate += attendanceBonus.tier3Bonus;
  if (averageDailyCount > averageCountBonus.threshold) rate += averageCountBonus.bonus;
  if (totalDeliveryCount >= totalCountBonus.threshold) rate += totalCountBonus.bonus;
  return rate;
}

// 組出「單價建構過程」逐步明細：固定原始單價 + 出勤三階／日均件數／總件數各項加給是否達標，
// 供前端呈現階梯式說明，取代過去只靠 formulaNotes 純文字描述
export function buildPieceRateBreakdown(
  attendanceDays: number,
  averageDailyCount: number,
  totalDeliveryCount: number,
  config: SalaryFormulaConfig
): PieceRateBreakdownStep[] {
  const { basePrice, attendanceBonus, averageCountBonus, totalCountBonus } = config.pieceRate;
  return [
    { key: "base", label: "固定原始單價", condition: "", amount: basePrice, hit: true },
    {
      key: "tier1",
      label: "出勤加給・第 1 階",
      condition: `出勤天數 ≥ ${attendanceBonus.tier1Days} 天`,
      amount: attendanceBonus.tier1Bonus,
      hit: attendanceDays >= attendanceBonus.tier1Days,
      metric: "days",
      current: attendanceDays,
      target: attendanceBonus.tier1Days,
      strict: false,
    },
    {
      key: "tier2",
      label: "出勤加給・第 2 階",
      condition: `出勤天數 ≥ ${attendanceBonus.tier2Days} 天`,
      amount: attendanceBonus.tier2Bonus,
      hit: attendanceDays >= attendanceBonus.tier2Days,
      metric: "days",
      current: attendanceDays,
      target: attendanceBonus.tier2Days,
      strict: false,
    },
    {
      key: "tier3",
      label: "出勤加給・第 3 階",
      condition: `出勤天數 ≥ ${attendanceBonus.tier3Days} 天`,
      amount: attendanceBonus.tier3Bonus,
      hit: attendanceDays >= attendanceBonus.tier3Days,
      metric: "days",
      current: attendanceDays,
      target: attendanceBonus.tier3Days,
      strict: false,
    },
    {
      key: "avg",
      label: "日均件數加給",
      condition: `日均件數 > ${averageCountBonus.threshold} 件`,
      amount: averageCountBonus.bonus,
      hit: averageDailyCount > averageCountBonus.threshold,
      metric: "avg",
      current: averageDailyCount,
      target: averageCountBonus.threshold,
      strict: true,
    },
    {
      key: "total",
      label: "當月總件數加給",
      condition: `總件數 ≥ ${totalCountBonus.threshold} 件`,
      amount: totalCountBonus.bonus,
      hit: totalDeliveryCount >= totalCountBonus.threshold,
      metric: "total",
      current: totalDeliveryCount,
      target: totalCountBonus.threshold,
      strict: false,
    },
  ];
}

// 激勵獎金兩階的門檻與達標狀況（判定規則同 resolveIncentiveBonus：出勤達天數且日均「超過」門檻）
export function buildIncentiveTiers(
  attendanceDays: number,
  averageDailyCount: number,
  config: SalaryFormulaConfig
): IncentiveTierProgress[] {
  const { tier1Days, tier1Avg, tier1Amount, tier2Days, tier2Avg, tier2Amount } = config.incentiveBonus;
  return [
    { days: tier1Days, avg: tier1Avg, amount: tier1Amount, hit: attendanceDays >= tier1Days && averageDailyCount > tier1Avg },
    { days: tier2Days, avg: tier2Avg, amount: tier2Amount, hit: attendanceDays >= tier2Days && averageDailyCount > tier2Avg },
  ];
}

// 純計算：給定某員工當月已撈出的各項原始資料，組裝出薪資結果。
// 不做任何資料庫查詢，供「單一員工」與「批次」兩條路徑共用，
// 確保兩者的加總邏輯永遠一致。
interface SalaryComputationInput {
  user: { id: string; name: string };
  year: number;
  month: number;
  config: SalaryFormulaConfig;
  // 固定職務加給：由員工指派之啟用中職務的金額決定（無職務則為 0），無條件加總
  jobAllowance: number;
  deliveryRecords: { date: Date; forwardCount: number; reverseCount: number }[];
  dailyRoleRecords: { date: Date; role: DailyRoleType }[];
  deductionRecords: { id: string; amount: number; reason: string }[];
  additionRecords?: { id: string; amount: number; reason: string }[];
  fuelReportRecords: { id: string; date: Date; amount: number; note: string | null }[];
  parkingFeeReportRecords: { id: string; date: Date; amount: number; note: string | null }[];
  inactive?: boolean;
}

// 回報日期不在這個薪資月份＝上月補報，回傳回報日期的年月（YYYY-MM）
function carriedFromOf(date: Date, year: number, month: number): string | null {
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month ? null : toDateOnlyString(date).slice(0, 7);
}

export function assembleEmployeeSalary(input: SalaryComputationInput): EmployeeMonthlySalary {
  const {
    user,
    year,
    month,
    config,
    jobAllowance,
    deliveryRecords,
    dailyRoleRecords,
    deductionRecords,
    additionRecords = [],
    fuelReportRecords,
    parkingFeeReportRecords,
    inactive,
  } = input;
  const { driverDaily: driverBonus, attendantDaily: attendantBonus } = config.roleBonus;

  const attendanceDays = deliveryRecords.length;
  const totalDeliveryCount = deliveryRecords.reduce(
    (sum, r) => sum + r.forwardCount + r.reverseCount,
    0
  );
  const averageDailyCount = attendanceDays > 0 ? totalDeliveryCount / attendanceDays : 0;

  const pieceRate = resolvePieceRate(attendanceDays, averageDailyCount, totalDeliveryCount, config);

  const roleByDate = new Map(dailyRoleRecords.map((r) => [toDateOnlyString(r.date), r.role]));
  const driverDays = dailyRoleRecords.filter((r) => r.role === "TRUCK_DRIVER").length;
  const attendantDays = dailyRoleRecords.filter((r) => r.role === "TRUCK_ATTENDANT").length;

  const dailyDetails: DailySalaryDetail[] = deliveryRecords.map((r) => {
    const totalCount = r.forwardCount + r.reverseCount;
    const date = toDateOnlyString(r.date);
    return {
      date,
      role: roleByDate.get(date) ?? "NONE",
      forwardCount: r.forwardCount,
      reverseCount: r.reverseCount,
      totalCount,
      rate: pieceRate,
      subtotal: totalCount * pieceRate,
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
  const additions: SalaryAdditionItem[] = additionRecords.map((a) => ({ id: a.id, amount: a.amount, reason: a.reason }));
  const additionTotal = additions.reduce((sum, a) => sum + a.amount, 0);

  const incentiveBonus = resolveIncentiveBonus(attendanceDays, averageDailyCount, config);

  const fuelAllowanceItems: FuelAllowanceItem[] = fuelReportRecords.map((r) => ({
    id: r.id,
    date: toDateOnlyString(r.date),
    amount: r.amount,
    note: r.note,
    carriedFrom: carriedFromOf(r.date, year, month),
  }));
  const fuelAllowance = fuelAllowanceItems.reduce((sum, r) => sum + r.amount, 0);

  const parkingFeeAllowanceItems: ParkingFeeAllowanceItem[] = parkingFeeReportRecords.map((r) => ({
    id: r.id,
    date: toDateOnlyString(r.date),
    amount: r.amount,
    note: r.note,
    carriedFrom: carriedFromOf(r.date, year, month),
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
    pieceRate,
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
    additions,
    additionTotal,
    ...(inactive ? { inactive: true } : {}),
    totalSalary:
      pieceWorkTotal +
      driverBonusTotal +
      attendantBonusTotal +
      jobAllowance +
      incentiveBonus +
      additionTotal +
      fuelAllowance +
      parkingFeeAllowance -
      deductionTotal,
    // 未含補貼（油資／停車費）的總數
    totalSalaryExcludingSubsidy:
      pieceWorkTotal +
      driverBonusTotal +
      attendantBonusTotal +
      jobAllowance +
      incentiveBonus +
      additionTotal -
      deductionTotal,
    formulaNotes: config.formulaNotes,
    rateBreakdown: buildPieceRateBreakdown(attendanceDays, averageDailyCount, totalDeliveryCount, config),
    incentiveTiers: buildIncentiveTiers(attendanceDays, averageDailyCount, config),
  };
}

// 職務加給生效判定（可複選職務，逐筆加總）：每筆指派的職務須存在且啟用；若該筆有設定任職起始日，
// 則只有「該起始日所屬月份（含）之後」的薪資月份才計入該筆加給，之前月份為 0。
// monthEnd 為該薪資月份的次月起始（startOfNextMonth），故起始日 < monthEnd 即代表已於當月或更早任職。
function resolveJobAllowance(
  assignments: { jobPosition: { allowance: number; isActive: boolean }; since: Date | null }[],
  monthEnd: Date
): number {
  return assignments.reduce((sum, a) => {
    if (!a.jobPosition.isActive) return sum;
    if (a.since && a.since >= monthEnd) return sum;
    return sum + a.jobPosition.allowance;
  }, 0);
}

export async function calculateEmployeeMonthlySalary(
  userId: string,
  year: number,
  month: number,
  formulaConfig?: SalaryFormulaConfig
): Promise<EmployeeMonthlySalary> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      jobPositions: { select: { jobPosition: { select: { allowance: true, isActive: true } }, since: true } },
      payGrade: { select: { config: true, isActive: true } },
    },
  });
  if (!user) {
    throw new Error("找不到指定員工");
  }

  const config = formulaConfig ?? resolvePayGradeConfig(user.payGrade, await getSalaryFormulaConfig());

  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);
  const dateRange = { gte: monthStart, lt: monthEnd };
  const jobAllowance = resolveJobAllowance(user.jobPositions, monthEnd);

  // 單一員工各項資料一次併發撈出（彼此無相依），再交由 assembleEmployeeSalary 組裝
  const [
    deliveryRecords,
    dailyRoleRecords,
    deductionRecords,
    additionRecords,
    fuelReportRecords,
    parkingFeeReportRecords,
  ] = await Promise.all([
    prisma.deliveryRecord.findMany({ where: { userId, date: dateRange }, orderBy: { date: "asc" } }),
    prisma.dailyRoleRecord.findMany({ where: { userId, date: dateRange } }),
    prisma.salaryDeduction.findMany({ where: { userId, year, month }, orderBy: { createdAt: "asc" } }),
    prisma.salaryAddition.findMany({ where: { userId, year, month }, orderBy: { createdAt: "asc" } }),
    prisma.fuelReport.findMany({
      where: { employeeId: userId, ...paidInMonth(monthStart, monthEnd) },
      orderBy: { date: "asc" },
    }),
    prisma.parkingFeeReport.findMany({
      where: { employeeId: userId, ...paidInMonth(monthStart, monthEnd) },
      orderBy: { date: "asc" },
    }),
  ]);

  return assembleEmployeeSalary({
    user,
    year,
    month,
    config,
    jobAllowance,
    deliveryRecords,
    dailyRoleRecords,
    deductionRecords,
    additionRecords,
    fuelReportRecords,
    parkingFeeReportRecords,
    inactive: !user.isActive,
  });
}

// 計入某個薪資月份的已核准油資／停車費：看 payMonth（核准時決定）；
// 沒有 payMonth 的已核准回報（例如直接改資料庫）照回報日期的月份算
function paidInMonth(monthStart: Date, monthEnd: Date) {
  return {
    status: "APPROVED" as const,
    OR: [{ payMonth: monthStart }, { payMonth: null, date: { gte: monthStart, lt: monthEnd } }],
  };
}

// 核准油資／停車費時決定計入哪個月的薪資：回報日期那個月還沒封存就算那個月；
// 已經封存（封存後才報、才核准，原本員工會領不到）就算進核准當月（台灣時間）起第一個還沒封存的月份
export async function resolvePayMonth(reportDate: Date, now: Date = new Date()): Promise<Date> {
  const dateMonth = startOfMonth(reportDate.getUTCFullYear(), reportDate.getUTCMonth() + 1);
  const isLocked = async (d: Date) => Boolean(await getSalaryMonthLock(d.getUTCFullYear(), d.getUTCMonth() + 1));
  if (!(await isLocked(dateMonth))) return dateMonth;
  const tw = taipeiParts(now);
  let candidate = startOfMonth(tw.year, tw.month);
  if (candidate <= dateMonth) candidate = startOfNextMonth(dateMonth.getUTCFullYear(), dateMonth.getUTCMonth() + 1);
  for (let i = 0; i < 36 && (await isLocked(candidate)); i++) {
    candidate = startOfNextMonth(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1);
  }
  return candidate;
}

export async function calculateAllEmployeesMonthlySalary(
  year: number,
  month: number,
  userIds?: string[]
): Promise<EmployeeMonthlySalary[]> {
  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);
  const dateRange = { gte: monthStart, lt: monthEnd };

  // 1) 先撈出符合條件的員工（含各自職務/職等，同一次查詢 JOIN 帶出，非 N+1）+ 預設公式。
  //    在職的人都列；已停用的人只要當月有送件、角色、加扣項或計入本月的油資停車費也要列（例如月中離職）
  const paid = paidInMonth(monthStart, monthEnd);
  const owners = await Promise.all([
    prisma.deliveryRecord.findMany({ where: { date: dateRange }, select: { userId: true }, distinct: ["userId"] }),
    prisma.dailyRoleRecord.findMany({ where: { date: dateRange }, select: { userId: true }, distinct: ["userId"] }),
    prisma.salaryDeduction.findMany({ where: { year, month }, select: { userId: true }, distinct: ["userId"] }),
    prisma.salaryAddition.findMany({ where: { year, month }, select: { userId: true }, distinct: ["userId"] }),
  ]);
  const reportOwners = await Promise.all([
    prisma.fuelReport.findMany({ where: paid, select: { employeeId: true }, distinct: ["employeeId"] }),
    prisma.parkingFeeReport.findMany({ where: paid, select: { employeeId: true }, distinct: ["employeeId"] }),
  ]);
  const withRecords = Array.from(
    new Set([...owners.flat().map((r) => r.userId), ...reportOwners.flat().map((r) => r.employeeId)])
  );
  const [users, defaultConfig] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [{ isActive: true }, { id: { in: withRecords } }],
        ...(userIds ? { id: { in: userIds } } : {}),
      },
      include: {
        jobPositions: { select: { jobPosition: { select: { allowance: true, isActive: true } }, since: true } },
        payGrade: { select: { config: true, isActive: true } },
      },
    }),
    getSalaryFormulaConfig(),
  ]);

  if (users.length === 0) {
    return [];
  }

  const ids = users.map((u) => u.id);

  // 2) 各類紀錄以 userId in [...] 一次撈齊（取代「每位員工各 N 次查詢」的 N+1）
  const [deliveries, dailyRoles, deductions, additions, fuelReports, parkingFeeReports] = await Promise.all([
    prisma.deliveryRecord.findMany({
      where: { userId: { in: ids }, date: dateRange },
      orderBy: { date: "asc" },
    }),
    prisma.dailyRoleRecord.findMany({ where: { userId: { in: ids }, date: dateRange } }),
    prisma.salaryDeduction.findMany({
      where: { userId: { in: ids }, year, month },
      orderBy: { createdAt: "asc" },
    }),
    prisma.salaryAddition.findMany({
      where: { userId: { in: ids }, year, month },
      orderBy: { createdAt: "asc" },
    }),
    prisma.fuelReport.findMany({
      where: { employeeId: { in: ids }, ...paid },
      orderBy: { date: "asc" },
    }),
    prisma.parkingFeeReport.findMany({
      where: { employeeId: { in: ids }, ...paid },
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
  const additionsByUser = groupByUser(additions, (r) => r.userId);
  const fuelByUser = groupByUser(fuelReports, (r) => r.employeeId);
  const parkingByUser = groupByUser(parkingFeeReports, (r) => r.employeeId);

  return users.map((user) =>
    assembleEmployeeSalary({
      user,
      year,
      month,
      config: resolvePayGradeConfig(user.payGrade, defaultConfig),
      jobAllowance: resolveJobAllowance(user.jobPositions, monthEnd),
      deliveryRecords: deliveriesByUser.get(user.id) ?? [],
      dailyRoleRecords: dailyRolesByUser.get(user.id) ?? [],
      deductionRecords: deductionsByUser.get(user.id) ?? [],
      additionRecords: additionsByUser.get(user.id) ?? [],
      fuelReportRecords: fuelByUser.get(user.id) ?? [],
      parkingFeeReportRecords: parkingByUser.get(user.id) ?? [],
      inactive: !user.isActive,
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

// 封存快照回填：舊快照可能沒有 totalSalaryExcludingSubsidy 欄位，
// 依既有明細補算，避免前端讀取封存月份時取到 undefined。
function hydrateSnapshot(raw: unknown): EmployeeMonthlySalary {
  const s = raw as EmployeeMonthlySalary;
  // 舊快照沒有加項欄位，補成空陣列與 0
  const withAdditions = { ...s, additions: s.additions ?? [], additionTotal: s.additionTotal ?? 0 };
  if (typeof s.totalSalaryExcludingSubsidy === "number") return withAdditions;
  return {
    ...withAdditions,
    totalSalaryExcludingSubsidy:
      (s.totalSalary ?? 0) - (s.fuelAllowance ?? 0) - (s.parkingFeeAllowance ?? 0),
  };
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
      return hydrateSnapshot(snapshot.data);
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
      salaries: snapshots.map((s) => hydrateSnapshot(s.data)),
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
