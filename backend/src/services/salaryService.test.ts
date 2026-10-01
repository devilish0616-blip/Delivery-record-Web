import { describe, it, expect, vi, beforeEach } from "vitest";

// 在 import salaryService 之前先 mock 掉資料庫模組，
// 讓 calculateEmployeeMonthlySalary 不會真的連線，可注入假資料。
vi.mock("../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    deliveryRecord: { findMany: vi.fn() },
    dailyRoleRecord: { findMany: vi.fn() },
    salaryDeduction: { findMany: vi.fn() },
    fuelReport: { findMany: vi.fn() },
    parkingFeeReport: { findMany: vi.fn() },
    salaryFormulaSettings: { findUnique: vi.fn() },
  },
}));

import { prisma } from "../lib/prisma";
import {
  DEFAULT_SALARY_FORMULA_CONFIG,
  resolvePieceRate,
  resolveIncentiveBonus,
  calculateEmployeeMonthlySalary,
} from "./salaryService";

const config = DEFAULT_SALARY_FORMULA_CONFIG;
// 取出預設門檻，測試以「公式設定的值」為基準而非寫死數字，
// 之後若調整預設值，測試的邊界仍會自動對齊。
const { basePrice, attendanceBonus, averageCountBonus, totalCountBonus } = config.pieceRate;

// ───────────────────────────────────────────────────────────────────────────
// 純函式：每件單價（固定原始單價 + 出勤/日均件數/總件數三項疊加加給）
// ───────────────────────────────────────────────────────────────────────────
describe("resolvePieceRate", () => {
  it("三項條件皆未達標 -> 僅原始單價", () => {
    expect(resolvePieceRate(0, 0, 0, config)).toBe(basePrice);
    expect(resolvePieceRate(attendanceBonus.tier1Days - 1, 0, 0, config)).toBe(basePrice);
  });

  it("出勤天數三階為疊加式，非互斥（達第二階時第一階加給仍計入）", () => {
    expect(resolvePieceRate(attendanceBonus.tier1Days, 0, 0, config)).toBe(
      basePrice + attendanceBonus.tier1Bonus
    );
    expect(resolvePieceRate(attendanceBonus.tier2Days, 0, 0, config)).toBe(
      basePrice + attendanceBonus.tier1Bonus + attendanceBonus.tier2Bonus
    );
    expect(resolvePieceRate(attendanceBonus.tier3Days, 0, 0, config)).toBe(
      basePrice + attendanceBonus.tier1Bonus + attendanceBonus.tier2Bonus + attendanceBonus.tier3Bonus
    );
  });

  it("日均件數：需嚴格大於門檻才加給（邊界值）", () => {
    expect(resolvePieceRate(0, averageCountBonus.threshold, 0, config)).toBe(basePrice);
    expect(resolvePieceRate(0, averageCountBonus.threshold + 1, 0, config)).toBe(
      basePrice + averageCountBonus.bonus
    );
  });

  it("當月總件數：達到門檻（含等於）即加給（邊界值）", () => {
    expect(resolvePieceRate(0, 0, totalCountBonus.threshold - 1, config)).toBe(basePrice);
    expect(resolvePieceRate(0, 0, totalCountBonus.threshold, config)).toBe(
      basePrice + totalCountBonus.bonus
    );
  });

  it("多項條件同時達標時全部疊加", () => {
    const expected =
      basePrice +
      attendanceBonus.tier1Bonus +
      attendanceBonus.tier2Bonus +
      attendanceBonus.tier3Bonus +
      averageCountBonus.bonus +
      totalCountBonus.bonus;
    expect(
      resolvePieceRate(attendanceBonus.tier3Days, averageCountBonus.threshold + 1, totalCountBonus.threshold, config)
    ).toBe(expected);
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
      jobPositions: [{ jobPosition: { allowance: 2000, isActive: true }, since: null }],
    } as never);

    // 兩天各 60 件 -> 出勤 2 天（未達任何加給門檻）、總件數 120、日均 60
    vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
      { id: "d1", date: day1, forwardCount: 50, reverseCount: 10 },
      { id: "d2", date: day2, forwardCount: 40, reverseCount: 20 },
    ] as never);

    // day1 司機、day2 隨車人員
    vi.mocked(prisma.dailyRoleRecord.findMany).mockResolvedValue([
      { id: "r1", date: day1, role: "TRUCK_DRIVER" },
      { id: "r2", date: day2, role: "TRUCK_ATTENDANT" },
    ] as never);

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
    // 出勤 2 天、日均剛好等於門檻（未嚴格大於）、總件數未達標 -> 無任何加給，僅原始單價
    expect(salary.pieceRate).toBe(config.pieceRate.basePrice);

    // 按件：兩天各 60 件 × 原始單價 23，合計 2760
    expect(salary.pieceWorkTotal).toBe(120 * config.pieceRate.basePrice);

    // 加給
    expect(salary.driverBonusTotal).toBe(config.roleBonus.driverDaily); // 1 天 × 司機日加給
    expect(salary.attendantBonusTotal).toBe(config.roleBonus.attendantDaily); // 1 天 × 隨車日加給
    expect(salary.jobAllowance).toBe(2000);
    expect(salary.incentiveBonus).toBe(0); // 出勤僅 2 天，未達門檻

    // 補貼與扣款
    expect(salary.fuelAllowance).toBe(800);
    expect(salary.parkingFeeAllowance).toBe(300);
    expect(salary.deductionTotal).toBe(200);

    // 實領 = 2760 + 1000 + 500 + 2000 + 0 + 800 + 300 - 200
    const expected =
      120 * config.pieceRate.basePrice + 1000 + 500 + 2000 + 0 + 800 + 300 - 200;
    expect(salary.totalSalary).toBe(expected);
  });

  it("找不到員工時拋出錯誤", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    await expect(calculateEmployeeMonthlySalary("nope", 2026, 6, config)).rejects.toThrow(
      "找不到指定員工"
    );
  });
});
