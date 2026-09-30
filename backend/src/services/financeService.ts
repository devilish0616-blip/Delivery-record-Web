// 記帳模組核心服務：預設資料初始化＋報表計算
// 報表計算拆成純函式（吃資料陣列、回計算結果），方便單元測試

import { FinanceCategoryGroup, FinanceCategoryKind, FinanceRecordType } from "@prisma/client";
import { prisma } from "../lib/prisma";

// ─── 預設資料（沿用舊單機系統 finance.db 的 settings） ─────────────────────────

export const DEFAULT_PARTIES: { name: string; isShareholder: boolean }[] = [
  { name: "陳彥旭", isShareholder: true },
  { name: "李泓玟", isShareholder: true },
  { name: "陳志欣", isShareholder: true },
  { name: "旭寺公款", isShareholder: false },
];

export const DEFAULT_EXPENSE_CATEGORIES = [
  "固定薪酬", "績效獎金", "租金", "油資", "維修", "保險",
  "雜支", "車貸", "押金(保證金)", "停車費", "其他",
];

export const DEFAULT_INCOME_CATEGORIES = ["物流盈餘", "利息", "退費", "其他", "投資"];

// 預設損益歸屬（與 migration 20260930120000_finance_category_group 一致），未列出者依 kind 套用預設
const DEFAULT_CATEGORY_GROUPS: Record<string, FinanceCategoryGroup> = {
  "INCOME:物流盈餘": "REVENUE",
  "EXPENSE:固定薪酬": "DIRECT_COST",
  "EXPENSE:績效獎金": "DIRECT_COST",
  "EXPENSE:油資": "DIRECT_COST",
  "EXPENSE:維修": "DIRECT_COST",
  "EXPENSE:停車費": "DIRECT_COST",
  "EXPENSE:押金(保證金)": "OTHER_EXPENSE",
};

export function defaultCategoryGroup(kind: FinanceCategoryKind, name: string): FinanceCategoryGroup {
  return DEFAULT_CATEGORY_GROUPS[`${kind}:${name}`] ?? effectiveCategoryGroup(kind, null);
}

// 分類實際生效的歸屬：未設定時依 kind 套用（收入→其他收入、支出→營業費用）
export function effectiveCategoryGroup(
  kind: FinanceCategoryKind,
  group: FinanceCategoryGroup | null
): FinanceCategoryGroup {
  return group ?? (kind === "INCOME" ? "OTHER_INCOME" : "OPERATING_EXPENSE");
}

// 帶入中心固定使用的入帳分類名稱
export const IMPORT_CATEGORY_NAMES = {
  fuel: "油資",
  parking: "停車費",
  salary: "固定薪酬",
  maintenance: { MAINTENANCE: "維修", INSURANCE: "保險", OTHER: "雜支" } as Record<string, string>,
};

// 首次使用時建立預設關係人／分類／帶入設定（冪等：已有資料就跳過）
export async function ensureFinanceDefaults(): Promise<void> {
  const partyCount = await prisma.financeParty.count();
  if (partyCount === 0) {
    await prisma.financeParty.createMany({
      data: DEFAULT_PARTIES.map((p, i) => ({ ...p, sortOrder: i })),
    });
  }

  const categoryCount = await prisma.financeCategory.count();
  if (categoryCount === 0) {
    await prisma.financeCategory.createMany({
      data: [
        ...DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({
          kind: FinanceCategoryKind.EXPENSE, name, sortOrder: i,
          group: defaultCategoryGroup(FinanceCategoryKind.EXPENSE, name),
        })),
        ...DEFAULT_INCOME_CATEGORIES.map((name, i) => ({
          kind: FinanceCategoryKind.INCOME, name, sortOrder: i,
          group: defaultCategoryGroup(FinanceCategoryKind.INCOME, name),
        })),
      ],
    });
  }

  const settings = await prisma.financeSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    const parties = await prisma.financeParty.findMany();
    const byName = new Map(parties.map((p) => [p.name, p.id]));
    await prisma.financeSettings.create({
      data: {
        id: 1,
        fuelPartyId: byName.get("陳彥旭") ?? null,
        parkingPartyId: byName.get("陳彥旭") ?? null,
        maintenancePartyId: byName.get("陳彥旭") ?? null,
        salaryPartyId: byName.get("旭寺公款") ?? null,
      },
    });
  }
}

// ─── 員工負責關係人（帶入中心：薪水／油資／停車費預設歸給誰出資） ────────────────

export interface EmployeeResponsibleParty {
  userId: string;
  userName: string;
  responsiblePartyId: string | null;
}

// 列出在職員工目前的負責關係人指派（未指派者 responsiblePartyId 為 null，帶入中心會 fallback 到全域預設）
export async function listEmployeeResponsibleParties(): Promise<EmployeeResponsibleParty[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, responsiblePartyId: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ userId: u.id, userName: u.name, responsiblePartyId: u.responsiblePartyId }));
}

// 指派／取消指派：partyId 為 null 表示改回沿用全域預設值
export async function setEmployeeResponsibleParty(
  userId: string,
  partyId: string | null
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("找不到指定的員工");
  if (partyId) {
    const party = await prisma.financeParty.findUnique({ where: { id: partyId } });
    if (!party) throw new Error("找不到指定的關係人");
  }
  await prisma.user.update({ where: { id: userId }, data: { responsiblePartyId: partyId } });
}

// 取得（必要時自動補建）指定分類，供帶入中心與舊資料匯入使用
export async function findOrCreateCategory(
  kind: FinanceCategoryKind,
  name: string
): Promise<{ id: string }> {
  const existing = await prisma.financeCategory.findUnique({
    where: { kind_name: { kind, name } },
  });
  if (existing) return existing;
  const maxOrder = await prisma.financeCategory.aggregate({
    where: { kind },
    _max: { sortOrder: true },
  });
  return prisma.financeCategory.create({
    data: { kind, name, sortOrder: (maxOrder._max.sortOrder ?? 0) + 1, group: defaultCategoryGroup(kind, name) },
  });
}

// ─── 報表計算（純函式） ────────────────────────────────────────────────────────

// 計算所需的最小帳目形狀（與 FinanceRecord 對齊，金額一律正數）
export interface FinanceRecordLike {
  type: FinanceRecordType;
  partyId: string;
  counterPartyId: string | null;
  categoryId: string | null;
  amount: number;
}

export interface ProfitSummary {
  incomeTotal: number;
  expenseTotal: number;
  net: number; // 淨損益（排除內部撥款）
}

// 損益摘要：收入合計／支出合計／淨損益（內部撥款不參與）
export function computeProfitSummary(records: FinanceRecordLike[]): ProfitSummary {
  let incomeTotal = 0;
  let expenseTotal = 0;
  for (const r of records) {
    if (r.type === "INCOME") incomeTotal += r.amount;
    else if (r.type === "EXPENSE") expenseTotal += r.amount;
  }
  return { incomeTotal, expenseTotal, net: incomeTotal - expenseTotal };
}

export interface GroupedProfit {
  revenue: number; // 營業收入
  otherIncome: number; // 其他收入
  directCost: number; // 直接成本
  operatingExpense: number; // 營業費用
  otherExpense: number; // 其他支出
  grossProfit: number; // 毛利＝營業收入 − 直接成本
  operatingProfit: number; // 營業利益＝毛利 − 營業費用
  net: number; // 淨損益＝營業利益 ＋ 其他收入 − 其他支出（與 computeProfitSummary.net 相同）
}

// 依分類歸屬拆解損益（內部撥款不參與）；無分類的收入視為其他收入、支出視為營業費用
export function computeGroupedProfit(
  records: FinanceRecordLike[],
  groupByCategory: Map<string, FinanceCategoryGroup>
): GroupedProfit {
  const sums: Record<FinanceCategoryGroup, number> = {
    REVENUE: 0, OTHER_INCOME: 0, DIRECT_COST: 0, OPERATING_EXPENSE: 0, OTHER_EXPENSE: 0,
  };
  for (const r of records) {
    if (r.type === "TRANSFER") continue;
    const fallback: FinanceCategoryGroup = r.type === "INCOME" ? "OTHER_INCOME" : "OPERATING_EXPENSE";
    let group = (r.categoryId && groupByCategory.get(r.categoryId)) || fallback;
    // 防呆：歸屬與帳目方向不符時（例如收入分類被設成成本）改用方向預設，確保淨損益不變
    const isIncomeGroup = group === "REVENUE" || group === "OTHER_INCOME";
    if (isIncomeGroup !== (r.type === "INCOME")) group = fallback;
    sums[group] += r.amount;
  }
  const grossProfit = sums.REVENUE - sums.DIRECT_COST;
  const operatingProfit = grossProfit - sums.OPERATING_EXPENSE;
  return {
    revenue: sums.REVENUE,
    otherIncome: sums.OTHER_INCOME,
    directCost: sums.DIRECT_COST,
    operatingExpense: sums.OPERATING_EXPENSE,
    otherExpense: sums.OTHER_EXPENSE,
    grossProfit,
    operatingProfit,
    net: operatingProfit + sums.OTHER_INCOME - sums.OTHER_EXPENSE,
  };
}

export interface CategorySummaryRow {
  categoryId: string | null;
  categoryName: string;
  amount: number;
  count: number;
  percent: number; // 佔比（0-100）
}

// 分類彙總：某類型（收入或支出）依分類加總，金額由大到小排序
export function summarizeByCategory(
  records: FinanceRecordLike[],
  type: Extract<FinanceRecordType, "INCOME" | "EXPENSE">,
  categoryNames: Map<string, string>
): CategorySummaryRow[] {
  const map = new Map<string | null, { amount: number; count: number }>();
  let total = 0;
  for (const r of records) {
    if (r.type !== type) continue;
    const entry = map.get(r.categoryId) ?? { amount: 0, count: 0 };
    entry.amount += r.amount;
    entry.count += 1;
    map.set(r.categoryId, entry);
    total += r.amount;
  }
  return Array.from(map.entries())
    .map(([categoryId, { amount, count }]) => ({
      categoryId,
      categoryName: (categoryId && categoryNames.get(categoryId)) || "未分類",
      amount,
      count,
      percent: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export interface SettlementRow {
  partyId: string;
  partyName: string;
  advanced: number; // 代墊支出（支出＋撥給他人）
  received: number; // 領回金額（收到撥款＋收入入袋）
  balance: number; // 剩餘結算（代墊 − 領回）
}

// 股東結算（與舊系統一致，已用 2026/06 月報表驗證）：
//   代墊支出 = 該股東名下支出總額 ＋ 內部撥款撥出總額
//   領回金額 = 內部撥款收到總額 ＋ 該股東名下收入總額（公司錢入袋）
//   剩餘結算 = 代墊支出 − 領回金額
export function computeSettlement(
  records: FinanceRecordLike[],
  shareholders: { id: string; name: string }[]
): SettlementRow[] {
  const rows = new Map<string, SettlementRow>(
    shareholders.map((s) => [
      s.id,
      { partyId: s.id, partyName: s.name, advanced: 0, received: 0, balance: 0 },
    ])
  );
  for (const r of records) {
    if (r.type === "EXPENSE") {
      const row = rows.get(r.partyId);
      if (row) row.advanced += r.amount;
    } else if (r.type === "INCOME") {
      const row = rows.get(r.partyId);
      if (row) row.received += r.amount;
    } else if (r.type === "TRANSFER") {
      const from = rows.get(r.partyId);
      if (from) from.advanced += r.amount;
      const to = r.counterPartyId ? rows.get(r.counterPartyId) : undefined;
      if (to) to.received += r.amount;
    }
  }
  for (const row of rows.values()) {
    row.balance = row.advanced - row.received;
  }
  return Array.from(rows.values());
}

export interface FundBalanceRow {
  partyId: string;
  partyName: string;
  balance: number; // 現金餘額＝收入＋撥入－支出－撥出（帳戶裡實際還有多少）
}

// 公款／非股東關係人的現金餘額：跟股東結算算法相同（收支＋撥款），但方向相反——
// 股東結算看「公司欠股東多少」，這裡看的是「這個帳戶裡還剩多少現金」
export function computeFundBalances(
  records: FinanceRecordLike[],
  funds: { id: string; name: string }[]
): FundBalanceRow[] {
  const rows = new Map<string, FundBalanceRow>(
    funds.map((f) => [f.id, { partyId: f.id, partyName: f.name, balance: 0 }])
  );
  for (const r of records) {
    if (r.type === "EXPENSE") {
      const row = rows.get(r.partyId);
      if (row) row.balance -= r.amount;
    } else if (r.type === "INCOME") {
      const row = rows.get(r.partyId);
      if (row) row.balance += r.amount;
    } else if (r.type === "TRANSFER") {
      const from = rows.get(r.partyId);
      if (from) from.balance -= r.amount;
      const to = r.counterPartyId ? rows.get(r.counterPartyId) : undefined;
      if (to) to.balance += r.amount;
    }
  }
  return Array.from(rows.values());
}

// 薪資帶入金額（拍板方案 A）：薪資總額扣除油資與停車費補貼，
// 油資／停車費由回報各自帶入自己的分類，避免重複計帳
export function computeSalaryImportAmount(snapshot: {
  totalSalary?: number;
  fuelAllowance?: number;
  parkingFeeAllowance?: number;
  totalSalaryExcludingSubsidy?: number;
}): number {
  if (typeof snapshot.totalSalaryExcludingSubsidy === "number") {
    return snapshot.totalSalaryExcludingSubsidy;
  }
  return (
    (snapshot.totalSalary ?? 0) -
    (snapshot.fuelAllowance ?? 0) -
    (snapshot.parkingFeeAllowance ?? 0)
  );
}
