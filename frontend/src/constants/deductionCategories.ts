import { AlertTriangle, CalendarX, Clock, MoreHorizontal, Wallet, type LucideIcon } from "lucide-react";

// 扣款分類快選清單（僅前端預設模板，不涉及後端 schema 變更）。
// 選擇分類後會在扣款原因欄位前加上「[分類名稱]」前綴，供列表顯示分類圖示與篩選辨識用；
// 若使用者事後修改原因文字移除了前綴，仍會正常顯示為「其他」分類，不影響扣款本身。
export interface DeductionCategory {
  key: string;
  label: string;
  icon: LucideIcon;
  template: string;
}

export const DEDUCTION_CATEGORIES: DeductionCategory[] = [
  { key: "late", label: "遲到早退", icon: Clock, template: "遲到 / 早退扣款" },
  { key: "leave", label: "事假曠職", icon: CalendarX, template: "事假 / 曠職扣款" },
  { key: "advance", label: "薪水預支", icon: Wallet, template: "薪水預支扣回" },
  { key: "violation", label: "違規罰款", icon: AlertTriangle, template: "違規罰款代繳" },
  { key: "other", label: "其他", icon: MoreHorizontal, template: "" },
];

export const OTHER_DEDUCTION_CATEGORY = DEDUCTION_CATEGORIES[DEDUCTION_CATEGORIES.length - 1];

export function findDeductionCategory(key: string): DeductionCategory {
  return DEDUCTION_CATEGORIES.find((c) => c.key === key) ?? OTHER_DEDUCTION_CATEGORY;
}
