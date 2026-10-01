import type { AssetCategory, AssetStatus } from "../../api/types";

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  MOTORCYCLE: "機車",
  TRUCK: "貨車",
  CAR: "汽車",
  EQUIPMENT: "設備",
  OTHER: "其他",
};

// 與後端 DEFAULT_LIFE_YEARS 相同：財政部固定資產耐用年數表常用值
export const DEFAULT_LIFE_YEARS: Record<AssetCategory, number> = {
  MOTORCYCLE: 3,
  TRUCK: 5,
  CAR: 5,
  EQUIPMENT: 3,
  OTHER: 5,
};

export const STATUS_STYLE: Record<AssetStatus, { label: string; className: string }> = {
  LOAN: { label: "繳款中", className: "bg-amber-100 text-amber-800" },
  PAID: { label: "已繳清", className: "bg-green-100 text-green-700" },
  SETTLED: { label: "提前結清", className: "bg-green-100 text-green-700" },
  CASH: { label: "一次付清", className: "bg-gray-100 text-gray-600" },
  DISPOSED: { label: "已處分", className: "bg-gray-200 text-gray-500" },
};

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

// 稅法常用殘值：成本 ÷（耐用年數＋1）
export function defaultSalvage(cost: number, years: number): number {
  return years > 0 ? Math.round(cost / (years + 1)) : 0;
}
