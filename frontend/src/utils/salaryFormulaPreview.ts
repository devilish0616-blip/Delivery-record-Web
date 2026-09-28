import type { PieceRateBreakdownStep, SalaryFormulaConfig } from "../api/types";

// 純函式鏡射 backend/src/services/salaryService.ts 的 resolvePieceRate / resolveIncentiveBonus /
// buildPieceRateBreakdown。僅供「職等薪資設定」頁的試算模擬器使用——模擬器輸入的是假設情境
// （尚未實際發生的出勤天數／件數），沒有對應的員工薪資紀錄可以查詢，因此無法沿用後端 API 回傳的
// rateBreakdown，只能在前端重新算一次。若日後調整計薪公式，記得兩邊同步修改。

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
    },
    {
      key: "tier2",
      label: "出勤加給・第 2 階",
      condition: `出勤天數 ≥ ${attendanceBonus.tier2Days} 天`,
      amount: attendanceBonus.tier2Bonus,
      hit: attendanceDays >= attendanceBonus.tier2Days,
    },
    {
      key: "tier3",
      label: "出勤加給・第 3 階",
      condition: `出勤天數 ≥ ${attendanceBonus.tier3Days} 天`,
      amount: attendanceBonus.tier3Bonus,
      hit: attendanceDays >= attendanceBonus.tier3Days,
    },
    {
      key: "avg",
      label: "日均件數加給",
      condition: `日均件數 > ${averageCountBonus.threshold} 件`,
      amount: averageCountBonus.bonus,
      hit: averageDailyCount > averageCountBonus.threshold,
    },
    {
      key: "total",
      label: "當月總件數加給",
      condition: `總件數 ≥ ${totalCountBonus.threshold} 件`,
      amount: totalCountBonus.bonus,
      hit: totalDeliveryCount >= totalCountBonus.threshold,
    },
  ];
}

export function pieceRateFromBreakdown(steps: PieceRateBreakdownStep[]): number {
  return steps.reduce((sum, s) => sum + (s.hit ? s.amount : 0), 0);
}

export function resolvePieceRate(
  attendanceDays: number,
  averageDailyCount: number,
  totalDeliveryCount: number,
  config: SalaryFormulaConfig
): number {
  return pieceRateFromBreakdown(
    buildPieceRateBreakdown(attendanceDays, averageDailyCount, totalDeliveryCount, config)
  );
}

export function resolveIncentiveBonus(
  attendanceDays: number,
  averageDailyCount: number,
  config: SalaryFormulaConfig
): { amount: number; tier: 0 | 1 | 2 } {
  const { tier1Days, tier1Avg, tier1Amount, tier2Days, tier2Avg, tier2Amount } = config.incentiveBonus;
  if (attendanceDays >= tier1Days && averageDailyCount > tier1Avg) {
    return { amount: tier1Amount, tier: 1 };
  }
  if (attendanceDays >= tier2Days && averageDailyCount > tier2Avg) {
    return { amount: tier2Amount, tier: 2 };
  }
  return { amount: 0, tier: 0 };
}
