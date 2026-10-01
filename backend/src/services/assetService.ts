// 資產列管：取得成本、零利率分期、直線法折舊、處分損益
// 計算一律以「月」為單位（UTC 日期），純函式不碰資料庫，供路由與單元測試共用。
//
// 折舊：直線法，自取得當月起每月攤提 (成本−殘值)÷(耐用年數×12)，攤到殘值為止；處分當月為最後一個攤提月。
// 分期：零利率，每期金額＝monthlyPayment，最後一期自動補「總價−頭期款−月付×(期數−1)」的尾數
//      （差額小於一期月付時才補，否則視為輸入有誤，回報 mismatch 由前端提醒）。
// 已繳期數依「繳款日已到」自動計算，不需逐期記帳；帶入記帳只影響帳本，不影響進度。

import { AssetCategory } from "@prisma/client";

export const DEFAULT_LIFE_YEARS: Record<AssetCategory, number> = {
  MOTORCYCLE: 3,
  TRUCK: 5,
  CAR: 5,
  EQUIPMENT: 3,
  OTHER: 5,
};

// 稅法常用殘值：成本 ÷（耐用年數＋1）
export function defaultSalvage(cost: number, years: number): number {
  return Math.round(cost / (years + 1));
}

export interface AssetLike {
  acquiredDate: Date;
  cost: number;
  usefulLifeYears: number;
  salvageValue: number;
  hasLoan: boolean;
  downPayment: number;
  monthlyPayment: number | null;
  termCount: number | null;
  firstPaymentDate: Date | null;
  paymentDay: number | null;
  settledDate: Date | null;
  settleAmount: number | null;
  disposedDate: Date | null;
  disposalAmount: number | null;
}

const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── 折舊 ────────────────────────────────────────────────────────────────────

export function lifeMonths(a: AssetLike): number {
  return Math.max(1, a.usefulLifeYears * 12);
}

export function monthlyDepreciation(a: AssetLike): number {
  return Math.max(0, a.cost - a.salvageValue) / lifeMonths(a);
}

// 截至 at（含當月）已攤提幾個月；處分後停止
export function depreciatedMonths(a: AssetLike, at: Date): number {
  let end = monthIndex(at);
  if (a.disposedDate) end = Math.min(end, monthIndex(a.disposedDate));
  const months = end - monthIndex(a.acquiredDate) + 1;
  return Math.min(lifeMonths(a), Math.max(0, months));
}

export function bookValueAt(a: AssetLike, at: Date): number {
  const months = depreciatedMonths(a, at);
  if (months >= lifeMonths(a)) return Math.min(a.cost, a.salvageValue);
  return round2(Math.max(a.salvageValue, a.cost - monthlyDepreciation(a) * months));
}

// 某年月的折舊金額（帳務月報「若用折舊計算」參考用）
export function depreciationInMonth(a: AssetLike, year: number, month: number): number {
  const idx = year * 12 + (month - 1);
  const start = monthIndex(a.acquiredDate);
  if (idx < start || idx >= start + lifeMonths(a)) return 0;
  if (a.disposedDate && idx > monthIndex(a.disposedDate)) return 0;
  return monthlyDepreciation(a);
}

// ─── 分期（零利率）────────────────────────────────────────────────────────────

export function loanPrincipal(a: AssetLike): number {
  return a.hasLoan ? Math.max(0, a.cost - a.downPayment) : 0;
}

// 總價−頭期款 與 月付×期數 的差額；正數＝月付×期數不足、負數＝超過
export function loanMismatch(a: AssetLike): number {
  if (!a.hasLoan || !a.monthlyPayment || !a.termCount) return 0;
  return round2(loanPrincipal(a) - a.monthlyPayment * a.termCount);
}

export function installmentAmounts(a: AssetLike): number[] {
  if (!a.hasLoan || !a.monthlyPayment || !a.termCount) return [];
  const list = Array<number>(a.termCount).fill(a.monthlyPayment);
  const diff = loanMismatch(a);
  if (diff !== 0 && Math.abs(diff) < a.monthlyPayment) list[a.termCount - 1] = round2(a.monthlyPayment + diff);
  return list;
}

// 第 no 期（1 起算）的繳款日；繳款日超過當月天數以月底計
export function installmentDueDate(a: AssetLike, no: number): Date {
  const first = a.firstPaymentDate!;
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth() + (no - 1);
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(a.paymentDay ?? 1, daysInMonth)));
}

export type AssetStatus = "CASH" | "LOAN" | "PAID" | "SETTLED" | "DISPOSED";

export interface LoanProgress {
  paidCount: number;
  remaining: number; // 尚未繳的金額（零利率即剩餘本金）
  nextNo: number | null;
  nextDueDate: Date | null;
  nextAmount: number | null;
  status: "LOAN" | "PAID" | "SETTLED";
}

export function loanProgressAt(a: AssetLike, at: Date): LoanProgress | null {
  const amounts = installmentAmounts(a);
  if (amounts.length === 0) return null;
  const settled = a.settledDate && a.settledDate.getTime() <= at.getTime() ? a.settledDate : null;
  const cutoff = settled ? new Date(settled.getTime() - 1) : at;
  let paidCount = 0;
  for (let no = 1; no <= amounts.length; no++) {
    if (installmentDueDate(a, no).getTime() <= cutoff.getTime()) paidCount = no;
    else break;
  }
  if (settled) return { paidCount, remaining: 0, nextNo: null, nextDueDate: null, nextAmount: null, status: "SETTLED" };
  const remaining = round2(amounts.slice(paidCount).reduce((s, n) => s + n, 0));
  if (paidCount >= amounts.length) {
    return { paidCount, remaining: 0, nextNo: null, nextDueDate: null, nextAmount: null, status: "PAID" };
  }
  return {
    paidCount,
    remaining,
    nextNo: paidCount + 1,
    nextDueDate: installmentDueDate(a, paidCount + 1),
    nextAmount: amounts[paidCount],
    status: "LOAN",
  };
}

// 某年月要繳的分期（提前結清後的期數不列）
export function installmentsInMonth(a: AssetLike, year: number, month: number) {
  const amounts = installmentAmounts(a);
  const out: { no: number; dueDate: Date; amount: number; isLast: boolean }[] = [];
  for (let no = 1; no <= amounts.length; no++) {
    const due = installmentDueDate(a, no);
    if (due.getUTCFullYear() !== year || due.getUTCMonth() + 1 !== month) continue;
    if (a.settledDate && due.getTime() >= a.settledDate.getTime()) continue;
    out.push({ no, dueDate: due, amount: amounts[no - 1], isLast: no === amounts.length });
  }
  return out;
}

export function assetStatusAt(a: AssetLike, at: Date): AssetStatus {
  if (a.disposedDate && a.disposedDate.getTime() <= at.getTime()) return "DISPOSED";
  if (!a.hasLoan) return "CASH";
  return loanProgressAt(a, at)?.status ?? "CASH";
}

// 處分損益＝處分金額−處分當月帳面價值
export function disposalGain(a: AssetLike): number | null {
  if (!a.disposedDate || a.disposalAmount === null) return null;
  return round2(a.disposalAmount - bookValueAt(a, a.disposedDate));
}

export function loanSourceId(assetId: string, no: number): string {
  return `${assetId}:${no}`;
}
