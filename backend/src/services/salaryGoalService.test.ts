import { describe, expect, it } from "vitest";
import { buildIncentiveTiers, buildPieceRateBreakdown, DEFAULT_SALARY_FORMULA_CONFIG } from "./salaryService";
import { nearestSalaryGoal, remainingWorkDays } from "./salaryGoalService";

const config = DEFAULT_SALARY_FORMULA_CONFIG;

function progress(days: number, total: number) {
  const avg = days > 0 ? total / days : 0;
  return {
    attendanceDays: days,
    totalDeliveryCount: total,
    averageDailyCount: avg,
    rateBreakdown: buildPieceRateBreakdown(days, avg, total, config),
    incentiveTiers: buildIncentiveTiers(days, avg, config),
  };
}

describe("buildPieceRateBreakdown 進度欄位", () => {
  it("出勤三階帶出目前天數與門檻，日均為嚴格大於", () => {
    const steps = buildPieceRateBreakdown(18, 58.1, 1046, config);
    const tier2 = steps.find((s) => s.key === "tier2")!;
    expect(tier2).toMatchObject({ metric: "days", current: 18, target: 20, hit: false, strict: false });
    const avg = steps.find((s) => s.key === "avg")!;
    expect(avg).toMatchObject({ metric: "avg", target: 60, strict: true, hit: false });
    expect(steps.find((s) => s.key === "base")!.metric).toBeUndefined();
  });

  it("激勵獎金兩階判定與 resolveIncentiveBonus 相同（日均需超過門檻）", () => {
    expect(buildIncentiveTiers(25, 60, config).map((t) => t.hit)).toEqual([false, true]);
    expect(buildIncentiveTiers(25, 60.5, config).map((t) => t.hit)).toEqual([true, true]);
    expect(buildIncentiveTiers(24, 70, config).map((t) => t.hit)).toEqual([false, false]);
  });
});

describe("nearestSalaryGoal", () => {
  it("差 2 天到第 2 階時提醒出勤", () => {
    const hint = nearestSalaryGoal(progress(18, 18 * 50), 10);
    expect(hint?.title).toBe("再出勤 2 天，每件單價 +$0.5");
  });

  it("月初差很多時不提醒", () => {
    expect(nearestSalaryGoal(progress(2, 100), 29)).toBeNull();
  });

  it("剩下的天數不夠就不提醒", () => {
    expect(nearestSalaryGoal(progress(13, 13 * 50), 1)).toBeNull();
  });

  it("日均已達標、只差出勤天數時優先提醒激勵獎金", () => {
    const hint = nearestSalaryGoal(progress(23, 23 * 65), 5);
    expect(hint?.title).toBe("再出勤 2 天，可拿激勵獎金 $3,000");
  });

  it("總件數只差一點、照目前日均來得及時提醒", () => {
    const hint = nearestSalaryGoal(progress(26, 1950), 4);
    expect(hint?.title).toBe("本月再送 50 件，每件單價 +$1");
  });

  it("全部達標時沒有提醒", () => {
    expect(nearestSalaryGoal(progress(26, 26 * 80), 3)).toBeNull();
  });
});

describe("remainingWorkDays", () => {
  it("今天還沒填要算今天", () => {
    expect(remainingWorkDays(2026, 10, 2, false)).toBe(30);
    expect(remainingWorkDays(2026, 10, 2, true)).toBe(29);
    expect(remainingWorkDays(2026, 2, 28, true)).toBe(0);
  });
});
