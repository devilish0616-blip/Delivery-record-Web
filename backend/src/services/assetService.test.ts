import { describe, it, expect } from "vitest";
import {
  bookValueAt,
  defaultSalvage,
  depreciatedMonths,
  depreciationInMonth,
  disposalGain,
  installmentAmounts,
  installmentDueDate,
  installmentsInMonth,
  loanMismatch,
  loanProgressAt,
  assetStatusAt,
  type AssetLike,
} from "./assetService";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function asset(over: Partial<AssetLike> = {}): AssetLike {
  return {
    acquiredDate: d("2025-02-10"),
    cost: 98000,
    usefulLifeYears: 3,
    salvageValue: defaultSalvage(98000, 3),
    hasLoan: false,
    downPayment: 0,
    monthlyPayment: null,
    termCount: null,
    firstPaymentDate: null,
    paymentDay: null,
    settledDate: null,
    settleAmount: null,
    disposedDate: null,
    disposalAmount: null,
    ...over,
  };
}

describe("折舊（直線法）", () => {
  it("殘值預設為成本 ÷（耐用年數＋1）", () => {
    expect(defaultSalvage(98000, 3)).toBe(24500);
    expect(defaultSalvage(1280000, 5)).toBe(213333);
  });

  it("自取得當月起算，每月攤提 (成本−殘值)÷月數", () => {
    const a = asset();
    // 2025/02 ~ 2025/02 共 1 個月
    expect(depreciatedMonths(a, d("2025-02-28"))).toBe(1);
    // 2025/02 ~ 2026/10 共 21 個月：98000 − (73500/36)×21 = 55125
    expect(bookValueAt(a, d("2026-10-01"))).toBe(55125);
  });

  it("取得前帳面價值為成本，攤滿後停在殘值", () => {
    const a = asset();
    expect(bookValueAt(a, d("2025-01-31"))).toBe(98000);
    expect(bookValueAt(a, d("2030-01-01"))).toBe(24500);
    expect(depreciationInMonth(a, 2028, 1)).toBeCloseTo(73500 / 36, 6); // 第 36 個月（2028/01）仍攤提
    expect(depreciationInMonth(a, 2028, 2)).toBe(0);
  });

  it("處分後停止攤提，處分損益＝處分金額−帳面價值", () => {
    const a = asset({ disposedDate: d("2026-01-15"), disposalAmount: 60000 });
    // 2025/02 ~ 2026/01 共 12 個月：98000 − 2041.666…×12 = 73500
    expect(bookValueAt(a, d("2026-10-01"))).toBe(73500);
    expect(depreciationInMonth(a, 2026, 2)).toBe(0);
    expect(disposalGain(a)).toBe(-13500);
    expect(assetStatusAt(a, d("2026-10-01"))).toBe("DISPOSED");
  });
});

describe("零利率分期", () => {
  const loan = (over: Partial<AssetLike> = {}) =>
    asset({
      hasLoan: true,
      downPayment: 0,
      monthlyPayment: 4083,
      termCount: 24,
      firstPaymentDate: d("2025-03-01"),
      paymentDay: 5,
      ...over,
    });

  it("最後一期自動補尾數", () => {
    const amounts = installmentAmounts(loan());
    expect(amounts).toHaveLength(24);
    expect(amounts[0]).toBe(4083);
    expect(amounts[23]).toBe(98000 - 4083 * 23); // 4091
    expect(amounts.reduce((s, n) => s + n, 0)).toBe(98000);
  });

  it("月付×期數與貸款金額差太多時不補尾數，回報差額", () => {
    const a = loan({ monthlyPayment: 3000 });
    expect(loanMismatch(a)).toBe(98000 - 72000);
    expect(installmentAmounts(a).every((n) => n === 3000)).toBe(true);
  });

  it("繳款日超過當月天數以月底計", () => {
    const a = loan({ firstPaymentDate: d("2026-01-01"), paymentDay: 31 });
    expect(installmentDueDate(a, 2).toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("已繳期數依繳款日是否已到自動計算", () => {
    const a = loan();
    // 2025/03/05 為第 1 期；到 2026/10/04 已過 19 期（2025/03 ~ 2026/09）
    const p = loanProgressAt(a, d("2026-10-04"))!;
    expect(p.paidCount).toBe(19);
    expect(p.nextNo).toBe(20);
    expect(p.remaining).toBe(98000 - 4083 * 19);
    // 繳款日當天算已繳
    expect(loanProgressAt(a, d("2026-10-05"))!.paidCount).toBe(20);
  });

  it("全部期數過後為已結清；提前結清後不再列應繳", () => {
    expect(loanProgressAt(loan(), d("2027-03-05"))!.status).toBe("PAID");
    const settled = loan({ settledDate: d("2026-06-20"), settleAmount: 34000 });
    const p = loanProgressAt(settled, d("2026-10-01"))!;
    expect(p.status).toBe("SETTLED");
    expect(p.remaining).toBe(0);
    expect(p.paidCount).toBe(16); // 2025/03 ~ 2026/06 的 6/5 已繳
    expect(installmentsInMonth(settled, 2026, 7)).toHaveLength(0);
    expect(assetStatusAt(settled, d("2026-10-01"))).toBe("SETTLED");
  });

  it("列出某月應繳的期數", () => {
    const list = installmentsInMonth(loan(), 2027, 2);
    expect(list).toEqual([{ no: 24, dueDate: d("2027-02-05"), amount: 4091, isLast: true }]);
  });

  it("有頭期款時只分期剩下的金額", () => {
    const a = loan({ cost: 1280000, downPayment: 280000, monthlyPayment: 16667, termCount: 60 });
    const amounts = installmentAmounts(a);
    expect(amounts.reduce((s, n) => s + n, 0)).toBe(1000000);
    expect(amounts[59]).toBe(1000000 - 16667 * 59);
  });
});
