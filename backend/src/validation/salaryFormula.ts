import { z } from "zod";

// 薪資計算公式（每件單價/激勵獎金）驗證schema，供「預設職等」與各自訂職等共用，
// 欄位形狀對應 salaryService.ts 的 SalaryFormulaConfig
export const salaryFormulaConfigSchema = z.object({
  pieceRate: z.object({
    basePrice: z.number().nonnegative(),
    attendanceBonus: z.object({
      tier1Days: z.number().int().nonnegative(),
      tier1Bonus: z.number().nonnegative(),
      tier2Days: z.number().int().nonnegative(),
      tier2Bonus: z.number().nonnegative(),
      tier3Days: z.number().int().nonnegative(),
      tier3Bonus: z.number().nonnegative(),
    }),
    averageCountBonus: z.object({
      threshold: z.number().nonnegative(),
      bonus: z.number().nonnegative(),
    }),
    totalCountBonus: z.object({
      threshold: z.number().nonnegative(),
      bonus: z.number().nonnegative(),
    }),
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
