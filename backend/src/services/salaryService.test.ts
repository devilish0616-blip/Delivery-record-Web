import { describe, it, expect, vi, beforeEach } from "vitest";

// 在 import salaryService 之前先 mock 掉資料庫模組，
// 讓 calculateEmployeeMonthlySalary 不會真的連線，可注入假資料。
vi.mock("../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    deliveryRecord: { findMany: vi.fn() },
    employeeTitleOverride: { findUnique: vi.fn() },
    dailyRoleRecord: { findMany: vi.fn() },
    salarySettings: { upsert: vi.fn() },
    salaryDeduction: { findMany: vi.fn() },
    fuelReport: { findMany: vi.fn() },
    parkingFeeReport: { findMany: vi.fn() },
    salaryFormulaSettings: { findUnique: vi.fn() },
  },
}));

import { prisma } from "../lib/prisma";
import {
  DEFAULT_SALARY_FORMULA_CONFIG,
  resolveCategoryByAttendance,
  resolveLevelByAverage,
  getDailyRate,
  resolveIncentiveBonus,
  calculateEmployeeMonthlySalary,
} from "./salaryService";

const config = DEFAULT_SALARY_FORMULA_CONFIG;
// 取出預設門檻，測試以「公式設定的值」為基準而非寫死數字，
// 之後若調整預設值，測試的邊界仍會自動對齊。
const { seniorMinDays, staffMinDays } = config.attendanceThresholds; // 20 / 10
const { highAvgThreshold } = config.levelThreshold; // 60
const { dailyCountBreakpoint } = config.dailyRates; // 100

// ───────────────────────────────────────────────────────────────────────────
// 純函式：職稱判定（依出勤天數）
// ───────────────────────────────────────────────────────────────────────────
describe("resolveCategoryByAttendance", () => {
  it("出勤天數 >= 資深門檻 -> SENIOR（邊界值）", () => {
    expect(resolveCategoryByAttendance(seniorMinDays, config)).toBe("SENIOR");
    expect(resolveCategoryByAttendance(seniorMinDays + 5, config)).toBe("SENIOR");
  });

  it("出勤天數介於員工門檻與資深門檻之間 -> STAFF", () => {
    expect(resolveCategoryByAttendance(seniorMinDays - 1, config)).toBe("STAFF"); // 19
    expect(resolveCategoryByAttendance(staffMinDays + 1, config)).toBe("STAFF"); // 11
  });

  it("出勤天數 <= 員工門檻 -> TEMP（邊界值不含等於）", () => {
    expect(resolveCategoryByAttendance(staffMinDays, config)).toBe("TEMP"); // 10，剛好不算 STAFF
    expect(resolveCategoryByAttendance(0, config)).toBe("TEMP");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 純函式：高/低件數判定（依日平均件數）
// ───────────────────────────────────────────────────────────────────────────
describe("resolveLevelByAverage", () => {
  it("日均 > 高件數門檻 -> HIGH", () => {
    expect(resolveLevelByAverage(highAvgThreshold + 1, config)).toBe("HIGH");
  });

  it("日均 == 高件數門檻 -> LOW（嚴格大於才算高）", () => {
    expect(resolveLevelByAverage(highAvgThreshold, config)).toBe("LOW");
  });

  it("日均 < 高件數門檻 -> LOW", () => {
    expect(resolveLevelByAverage(highAvgThreshold - 1, config)).toBe("LOW");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 純函式：每日單價（職稱 × 高低 × 單日件數門檻）
// ───────────────────────────────────────────────────────────────────────────
describe("getDailyRate", () => {
  const rates = config.dailyRates;

  it("執行長 / 特殊職稱：固定單價，與件數無關", () => {
    expect(getDailyRate("CEO", null, 0, config)).toBe(rates.special);
    expect(getDailyRate("CEO", null, 999, config)).toBe(rates.special);
    expect(getDailyRate("SPECIAL", null, 50, config)).toBe(rates.special);
  });

  it("臨時工：固定單價，與件數無關", () => {
    expect(getDailyRate("TEMP", null, 0, config)).toBe(rates.temp);
    expect(getDailyRate("TEMP", null, 200, config)).toBe(rates.temp);
  });

  it("資深/員工 高件數：超過單日門檻採高單價、未超過採低單價（邊界值）", () => {
    expect(getDailyRate("SENIOR", "HIGH", dailyCountBreakpoint + 1, config)).toBe(rates.seniorStaffHigh.above);
    expect(getDailyRate("SENIOR", "HIGH", dailyCountBreakpoint, config)).toBe(rates.seniorStaffHigh.atOrBelow);
    expect(getDailyRate("STAFF", "HIGH", dailyCountBreakpoint + 1, config)).toBe(rates.seniorStaffHigh.above);
  });

  it("資深/員工 低件數：超過單日門檻採高單價、未超過採低單價（邊界值）", () => {
    expect(getDailyRate("SENIOR", "LOW", dailyCountBreakpoint + 1, config)).toBe(rates.seniorStaffLow.above);
    expect(getDailyRate("SENIOR", "LOW", dailyCountBreakpoint, config)).toBe(rates.seniorStaffLow.atOrBelow);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 純函式：激勵獎金（兩階梯，IF/ELSE 不疊加）
// ───────────────────────────────────────────────────────────────────────────
describe("resolveIncentiveBonus", () => {
  const inc = config.incentiveBonus;

  it("達第一階（出勤達標 + 日均 > 高門檻）-> 第一階獎金", () => {
    expect(resolveIncentiveBonus(inc.tier1Days, inc.tier1Avg + 1, config)).toBe(inc.tier1Amount);
  });

  it("只達第二階（日均介於兩門檻之間）-> 第二階獎金", () => {
    // 日均剛好等於第一階門檻：不達第一階（需嚴格大於），但仍 > 第二階門檻
    expect(resolveIncentiveBonus(inc.tier2Days, inc.tier1Avg, config)).toBe(inc.tier2Amount);
    expect(resolveIncentiveBonus(inc.tier2Days, inc.tier2Avg + 1, config)).toBe(inc.tier2Amount);
  });

  it("日均剛好等於第二階門檻 -> 不發（需嚴格大於）", () => {
    expect(resolveIncentiveBonus(inc.tier2Days, inc.tier2Avg, config)).toBe(0);
  });

  it("出勤未達門檻 -> 不發，無論件數多高", () => {
    expect(resolveIncentiveBonus(inc.tier1Days - 1, 999, config)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 整合：calculateEmployeeMonthlySalary（mock Prisma，驗證整條加總公式）
// 重點守住「油資 + 停車費補貼有無正確計入總額」這類回歸風險。
// ───────────────────────────────────────────────────────────────────────────
describe("calculateEmployeeMonthlySalary", () => {
  const day1 = new Date(Date.UTC(2026, 5, 1));
  const day2 = new Date(Date.UTC(2026, 5, 2));

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      name: "測試員工",
      specialTitle: null,
      jobPosition: { allowance: 2000, isActive: true },
    } as never);

    // 兩天各 60 件 -> 出勤 2 天（TEMP）、總件數 120、日均 60
    vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
      { id: "d1", date: day1, forwardCount: 50, reverseCount: 10 },
      { id: "d2", date: day2, forwardCount: 40, reverseCount: 20 },
    ] as never);

    vi.mocked(prisma.employeeTitleOverride.findUnique).mockResolvedValue(null as never);

    // day1 司機、day2 隨車人員
    vi.mocked(prisma.dailyRoleRecord.findMany).mockResolvedValue([
      { id: "r1", date: day1, role: "TRUCK_DRIVER" },
      { id: "r2", date: day2, role: "TRUCK_ATTENDANT" },
    ] as never);

    vi.mocked(prisma.salarySettings.upsert).mockResolvedValue({
      id: 1,
      driverBonus: 1000,
      attendantBonus: 500,
      registrationEnabled: true,
    } as never);

    vi.mocked(prisma.salaryDeduction.findMany).mockResolvedValue([
      { id: "ded1", amount: 200, reason: "請假扣款" },
    ] as never);

    vi.mocked(prisma.fuelReport.findMany).mockResolvedValue([
      { id: "f1", date: day1, amount: 800, note: null },
    ] as never);

    vi.mocked(prisma.parkingFeeReport.findMany).mockResolvedValue([
      { id: "p1", date: day1, amount: 300, note: null },
    ] as never);
  });

  it("依各項加總算出正確實領薪資", async () => {
    const salary = await calculateEmployeeMonthlySalary("u1", 2026, 6, config);

    // 基本判定
    expect(salary.attendanceDays).toBe(2);
    expect(salary.totalDeliveryCount).toBe(120);
    expect(salary.averageDailyCount).toBe(60);
    expect(salary.titleCategory).toBe("TEMP"); // 出勤 2 天
    expect(salary.titleSource).toBe("AUTO");

    // 按件：TEMP 固定單價 23 -> 兩天各 60*23=1380，合計 2760
    expect(salary.pieceWorkTotal).toBe(120 * config.dailyRates.temp);

    // 加給
    expect(salary.driverBonusTotal).toBe(1000); // 1 天 × 1000
    expect(salary.attendantBonusTotal).toBe(500); // 1 天 × 500
    expect(salary.jobAllowance).toBe(2000);
    expect(salary.incentiveBonus).toBe(0); // 出勤僅 2 天，未達門檻

    // 補貼與扣款
    expect(salary.fuelAllowance).toBe(800);
    expect(salary.parkingFeeAllowance).toBe(300);
    expect(salary.deductionTotal).toBe(200);

    // 實領 = 2760 + 1000 + 500 + 2000 + 0 + 800 + 300 - 200
    const expected =
      120 * config.dailyRates.temp + 1000 + 500 + 2000 + 0 + 800 + 300 - 200;
    expect(salary.totalSalary).toBe(expected);
  });

  it("特殊職稱（執行長）不參與自動判定，單價固定", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      name: "執行長",
      specialTitle: "CEO",
      jobPosition: null,
    } as never);

    const salary = await calculateEmployeeMonthlySalary("u1", 2026, 6, config);

    expect(salary.titleCategory).toBe("CEO");
    expect(salary.titleSource).toBe("SPECIAL");
    expect(salary.titleLevel).toBeNull();
    // 每件套用 special 單價
    expect(salary.pieceWorkTotal).toBe(120 * config.dailyRates.special);
  });

  it("找不到員工時拋出錯誤", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    await expect(calculateEmployeeMonthlySalary("nope", 2026, 6, config)).rejects.toThrow(
      "找不到指定員工"
    );
  });
});
