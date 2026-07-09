import { describe, it, expect } from "vitest";
import {
  computeProfitSummary,
  computeSettlement,
  computeSalaryImportAmount,
  summarizeByCategory,
  type FinanceRecordLike,
} from "./financeService";
import { mergeTransferPairs } from "../../scripts/importFinanceDb";

// 建立測試帳目的小工具（金額一律正數，方向由 type 決定）
function rec(
  type: FinanceRecordLike["type"],
  partyId: string,
  amount: number,
  extra: Partial<FinanceRecordLike> = {}
): FinanceRecordLike {
  return { type, partyId, amount, counterPartyId: null, categoryId: null, ...extra };
}

// ───────────────────────────────────────────────────────────────────────────
// 損益摘要：內部撥款不參與
// ───────────────────────────────────────────────────────────────────────────
describe("computeProfitSummary", () => {
  it("收入／支出加總，內部撥款排除", () => {
    const records = [
      rec("INCOME", "a", 589000),
      rec("EXPENSE", "a", 500000),
      rec("EXPENSE", "b", 81854),
      rec("TRANSFER", "a", 999999, { counterPartyId: "b" }),
    ];
    const s = computeProfitSummary(records);
    expect(s.incomeTotal).toBe(589000);
    expect(s.expenseTotal).toBe(581854);
    expect(s.net).toBe(7146);
  });

  it("無帳目時全為 0", () => {
    expect(computeProfitSummary([])).toEqual({ incomeTotal: 0, expenseTotal: 0, net: 0 });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 分類彙總：金額排序＋佔比＋未分類
// ───────────────────────────────────────────────────────────────────────────
describe("summarizeByCategory", () => {
  const names = new Map([
    ["c1", "油資"],
    ["c2", "租金"],
  ]);

  it("依金額由大到小排序並計算佔比與筆數", () => {
    const records = [
      rec("EXPENSE", "a", 300, { categoryId: "c1" }),
      rec("EXPENSE", "a", 200, { categoryId: "c1" }),
      rec("EXPENSE", "a", 500, { categoryId: "c2" }),
      rec("INCOME", "a", 999, { categoryId: "c2" }), // 不同類型不納入
    ];
    const rows = summarizeByCategory(records, "EXPENSE", names);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ categoryName: "油資", amount: 500, count: 2, percent: 50 });
    expect(rows[1]).toMatchObject({ categoryName: "租金", amount: 500, count: 1, percent: 50 });
  });

  it("查不到分類名稱時顯示未分類", () => {
    const rows = summarizeByCategory([rec("EXPENSE", "a", 100, { categoryId: "cX" })], "EXPENSE", names);
    expect(rows[0].categoryName).toBe("未分類");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 股東結算：代墊＝支出＋撥出、領回＝撥入＋收入（以 2026/06 舊月報數字驗證）
// ───────────────────────────────────────────────────────────────────────────
describe("computeSettlement", () => {
  const shareholders = [
    { id: "chen", name: "陳彥旭" },
    { id: "lee", name: "李泓玟" },
    { id: "hsin", name: "陳志欣" },
  ];

  it("重現 2026/06 月報表股東結算（李泓玟代墊含撥出）", () => {
    // 依實際六月資料的彙總結構：支出＋撥出＝代墊、撥入＝領回
    const records: FinanceRecordLike[] = [
      rec("EXPENSE", "chen", 48138),
      rec("EXPENSE", "lee", 90237),
      rec("EXPENSE", "fund", 443479), // 公款支出不影響股東結算
      rec("INCOME", "fund", 589000),
      // 李泓玟撥出 228,000（其中 48,000 給陳彥旭、180,000 給公款）
      rec("TRANSFER", "lee", 48000, { counterPartyId: "chen" }),
      rec("TRANSFER", "lee", 180000, { counterPartyId: "fund" }),
      // 李泓玟收到 332,000（公款 269,000＋63,000）
      rec("TRANSFER", "fund", 269000, { counterPartyId: "lee" }),
      rec("TRANSFER", "fund", 63000, { counterPartyId: "lee" }),
    ];
    const rows = computeSettlement(records, shareholders);
    const byName = Object.fromEntries(rows.map((r) => [r.partyName, r]));
    expect(byName["陳彥旭"]).toMatchObject({ advanced: 48138, received: 48000, balance: 138 });
    expect(byName["李泓玟"]).toMatchObject({ advanced: 318237, received: 332000, balance: -13763 });
    expect(byName["陳志欣"]).toMatchObject({ advanced: 0, received: 0, balance: 0 });
  });

  it("股東名下收入視為領回（公司錢入袋）", () => {
    const rows = computeSettlement([rec("INCOME", "chen", 10000)], shareholders);
    expect(rows[0]).toMatchObject({ partyName: "陳彥旭", received: 10000, balance: -10000 });
  });

  it("非股東（公款）不出現在結算列", () => {
    const rows = computeSettlement([rec("EXPENSE", "fund", 999)], shareholders);
    expect(rows.every((r) => r.partyId !== "fund")).toBe(true);
    expect(rows).toHaveLength(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 薪資帶入金額（方案 A）：薪資總額扣除油資／停車費補貼
// ───────────────────────────────────────────────────────────────────────────
describe("computeSalaryImportAmount", () => {
  it("快照已有 totalSalaryExcludingSubsidy 時直接採用", () => {
    expect(
      computeSalaryImportAmount({
        totalSalary: 50000,
        fuelAllowance: 2000,
        parkingFeeAllowance: 500,
        totalSalaryExcludingSubsidy: 47500,
      })
    ).toBe(47500);
  });

  it("舊快照缺欄位時回退為 totalSalary − 油資 − 停車費", () => {
    expect(
      computeSalaryImportAmount({ totalSalary: 50000, fuelAllowance: 2000, parkingFeeAllowance: 500 })
    ).toBe(47500);
  });

  it("完全沒有補貼欄位時等於薪資總額", () => {
    expect(computeSalaryImportAmount({ totalSalary: 30000 })).toBe(30000);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 舊資料匯入：內部撥款成對合併
// ───────────────────────────────────────────────────────────────────────────
describe("mergeTransferPairs", () => {
  function oldRow(
    id: number,
    date: string,
    party: string,
    amount: number,
    purpose: string,
    note = ""
  ) {
    return { id, date, record_type: "內部撥款", party, amount, purpose, note, created_at: "" };
  }

  it("撥給／收到成對合併為單筆（轉出方→轉入方）", () => {
    const { merged, errors } = mergeTransferPairs([
      oldRow(1, "2026-06-03", "李泓玟", -180000, "撥給 旭寺公款"),
      oldRow(2, "2026-06-03", "旭寺公款", 180000, "收到 李泓玟"),
    ]);
    expect(errors).toHaveLength(0);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "TRANSFER",
      partyName: "李泓玟",
      counterPartyName: "旭寺公款",
      amount: 180000,
    });
  });

  it("同日同金額多組也能依關係人正確配對", () => {
    const { merged, errors } = mergeTransferPairs([
      oldRow(1, "2026-06-03", "李泓玟", -5000, "撥給 陳彥旭", "公款"),
      oldRow(2, "2026-06-03", "陳彥旭", 5000, "收到 李泓玟", "公款"),
      oldRow(3, "2026-06-03", "陳志欣", -5000, "撥給 陳彥旭", "公款"),
      oldRow(4, "2026-06-03", "陳彥旭", 5000, "收到 陳志欣", "公款"),
    ]);
    expect(errors).toHaveLength(0);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.partyName)).toEqual(["李泓玟", "陳志欣"]);
  });

  it("找不到配對時回報錯誤，不產生合併結果", () => {
    const { merged, errors } = mergeTransferPairs([
      oldRow(1, "2026-06-03", "李泓玟", -5000, "撥給 陳彥旭"),
      oldRow(2, "2026-06-04", "陳彥旭", 5000, "收到 李泓玟"), // 日期不同，不配對
    ]);
    expect(merged).toHaveLength(0);
    expect(errors).toHaveLength(2);
  });
});
