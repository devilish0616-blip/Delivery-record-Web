import type { EmployeeMonthlySalary } from "../api/types";

// 薪資組成分類與對應顏色（categorical 色盤，通過 dataviz skill 的 CVD／對比驗證），
// 供整體薪資組成圖、個人薪資組成堆疊條共用，確保同一分類在所有圖表中顏色一致。
export const COMPOSITION_KEYS = ["piece", "driver", "attendant", "job", "incentive", "fuel", "parking"] as const;
export type CompositionKey = (typeof COMPOSITION_KEYS)[number];

export const COMPOSITION_META: Record<CompositionKey, { label: string; color: string }> = {
  piece: { label: "按件薪資", color: "#2a78d6" },
  driver: { label: "司機加給", color: "#eb6834" },
  attendant: { label: "隨車加給", color: "#1baf7a" },
  job: { label: "職務加給", color: "#eda100" },
  incentive: { label: "激勵獎金", color: "#e87ba4" },
  fuel: { label: "油資補貼", color: "#008300" },
  parking: { label: "停車費補貼", color: "#4a3aa7" },
};

export function compositionOf(s: EmployeeMonthlySalary): Record<CompositionKey, number> {
  return {
    piece: s.pieceWorkTotal,
    driver: s.driverBonusTotal,
    attendant: s.attendantBonusTotal,
    job: s.jobAllowance,
    incentive: s.incentiveBonus,
    fuel: s.fuelAllowance,
    parking: s.parkingFeeAllowance,
  };
}
