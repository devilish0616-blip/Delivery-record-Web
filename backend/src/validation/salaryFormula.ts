import { z } from "zod";

// 薪資計算公式（門檻/單價/激勵獎金）驗證schema，供「預設職等」與各自訂職等共用，
// 欄位形狀對應 salaryService.ts 的 SalaryFormulaConfig
export const salaryFormulaConfigSchema = z.object({
  attendanceThresholds: z.object({
    seniorMinDays: z.number().int().nonnegative(),
    staffMinDays: z.number().int().nonnegative(),
  }),
  levelThreshold: z.object({
    highAvgThreshold: z.number().nonnegative(),
  }),
  dailyRates: z.object({
    dailyCountBreakpoint: z.number().nonnegative(),
    seniorStaffHigh: z.object({
      above: z.number().nonnegative(),
      atOrBelow: z.number().nonnegative(),
    }),
    seniorStaffLow: z.object({
      above: z.number().nonnegative(),
      atOrBelow: z.number().nonnegative(),
    }),
    temp: z.number().nonnegative(),
  }),
  incentiveBonus: z.object({
    tier1Days: z.number().int().nonnegative(),
    tier1Avg: z.number().nonnegative(),
    tier1Amount: z.number().nonnegative(),
    tier2Days: z.number().int().nonnegative(),
    tier2Avg: z.number().nonnegative(),
    tier2Amount: z.number().nonnegative(),
  }),
  formulaNotes: z.string(),
});
