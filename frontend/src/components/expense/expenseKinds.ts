import type { FuelReport, VehicleType } from "../../api/types";

// 加油回報與停車費回報欄位完全相同（後端共用 expenseReport.routes），前端以 kind 區分 API 路徑與文字
export type ExpenseKind = "fuel" | "parking";
export type ExpenseReport = FuelReport;

export const EXPENSE_KINDS: Record<
  ExpenseKind,
  {
    api: string;
    name: string; // 回報名稱：加油回報／停車費回報
    short: string; // 審核與補貼名稱：油資／停車費
    dateLabel: string;
    amountPlaceholder: string;
    notePlaceholder: string;
  }
> = {
  fuel: {
    api: "/fuel-reports",
    name: "加油回報",
    short: "油資",
    dateLabel: "加油日期",
    amountPlaceholder: "例：500",
    notePlaceholder: "其他說明",
  },
  parking: {
    api: "/parking-fee-reports",
    name: "停車費回報",
    short: "停車費",
    dateLabel: "停車日期",
    amountPlaceholder: "例：100",
    notePlaceholder: "停車地點或其他說明",
  },
};

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  MOTORCYCLE: "機車",
  TRUCK: "貨車",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
}

export function shiftMonth(y: number, m: number): { year: number; month: number } {
  if (m < 1) return { year: y - 1, month: 12 };
  if (m > 12) return { year: y + 1, month: 1 };
  return { year: y, month: m };
}
