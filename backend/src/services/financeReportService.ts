// 記帳模組：月報／年度總覽資料組裝（供 API、Excel、PDF 共用）

import type { FinanceCategoryGroup, FinanceCategoryKind } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getAllEmployeesMonthlySalary } from "./salaryService";
import { startOfMonth, startOfNextMonth, toDateOnlyString } from "../utils/date";
import {
  computeFundBalances,
  computeGroupedProfit,
  computeProfitSummary,
  effectiveCategoryGroup,
  IMPORT_CATEGORY_NAMES,
  computeSettlement,
  summarizeByCategory,
  type CategorySummaryRow,
  type FundBalanceRow,
  type GroupedProfit,
  type ProfitSummary,
  type SettlementRow,
} from "./financeService";

export interface ReportRecordRow {
  id: string;
  date: string; // YYYY-MM-DD
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  partyName: string;
  counterPartyName: string | null;
  categoryName: string | null;
  amount: number;
  note: string | null;
  sourceType: string;
}

export interface CategoryBreakdownRow {
  categoryId: string | null;
  categoryName: string;
  kind: FinanceCategoryKind;
  group: FinanceCategoryGroup;
  amount: number;
  prevAmount: number; // 上月同分類金額
  count: number;
}

export interface MonthlyFinanceReport {
  year: number;
  month: number;
  summary: ProfitSummary;
  profit: GroupedProfit; // 依分類歸屬拆解：毛利／營業利益
  prevProfit: GroupedProfit; // 上月（供較上月比較）
  categoryBreakdown: CategoryBreakdownRow[]; // 本月與上月有金額的分類，含歸屬層級
  pending: { count: number; amount: number }; // 本月待審核（未計入報表）
  expenseByCategory: CategorySummaryRow[];
  incomeByCategory: CategorySummaryRow[];
  records: ReportRecordRow[];
  settlement: SettlementRow[]; // 當月股東結算
  cumulativeSettlement: SettlementRow[]; // 開帳以來至當月月底的累計結算
}

const recordInclude = {
  party: { select: { name: true } },
  counterParty: { select: { name: true } },
  category: { select: { name: true } },
} as const;

// 結算對象：啟用中的股東，加上有歷史往來的停用股東（避免停用後累計數字消失）
async function getSettlementParties() {
  return prisma.financeParty.findMany({
    where: { isShareholder: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, isActive: true },
  });
}

// 公款／非股東關係人（如「旭寺公款」）：不參與股東結算，改看現金餘額
async function getFundParties() {
  return prisma.financeParty.findMany({
    where: { isShareholder: false },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, isActive: true },
  });
}

function categoryGroupMap(
  categories: { id: string; kind: FinanceCategoryKind; group: FinanceCategoryGroup | null }[]
): Map<string, FinanceCategoryGroup> {
  return new Map(categories.map((c) => [c.id, effectiveCategoryGroup(c.kind, c.group)]));
}

function buildCategoryBreakdown(
  current: { type: string; categoryId: string | null; amount: number }[],
  prev: { type: string; categoryId: string | null; amount: number }[],
  categories: { id: string; name: string; kind: FinanceCategoryKind; group: FinanceCategoryGroup | null }[]
): CategoryBreakdownRow[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rows = new Map<string, CategoryBreakdownRow>();
  const touch = (r: { type: string; categoryId: string | null }) => {
    const kind = r.type as FinanceCategoryKind;
    const key = `${kind}:${r.categoryId ?? ""}`;
    let row = rows.get(key);
    if (!row) {
      const cat = r.categoryId ? byId.get(r.categoryId) : undefined;
      row = {
        categoryId: r.categoryId,
        categoryName: cat?.name ?? "未分類",
        kind,
        group: effectiveCategoryGroup(kind, cat && cat.kind === kind ? cat.group : null),
        amount: 0,
        prevAmount: 0,
        count: 0,
      };
      rows.set(key, row);
    }
    return row;
  };
  for (const r of current) {
    if (r.type === "TRANSFER") continue;
    const row = touch(r);
    row.amount += r.amount;
    row.count += 1;
  }
  for (const r of prev) {
    if (r.type === "TRANSFER") continue;
    touch(r).prevAmount += r.amount;
  }
  return [...rows.values()].sort((a, b) => b.amount - a.amount || b.prevAmount - a.prevAmount);
}

export interface OperationsEstimate {
  estimatedRevenue: number | null; // 件數 × 實拿單價（未設定單價時為 null）
  estimatedSalaryCost: number; // 薪資系統試算總額
  actualRevenue: number; // 記帳：營業收入
  actualSalaryCost: number; // 記帳：固定薪酬＋績效獎金
}

// 營運預估 vs 實際記帳：與儀表板／每日營運總表相同的預估算法，用來抓漏記的帳
export async function getOperationsEstimate(year: number, month: number): Promise<OperationsEstimate> {
  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);
  const [deliveries, pricing, { salaries }, records, categories] = await Promise.all([
    prisma.deliveryRecord.aggregate({
      where: { date: { gte: monthStart, lt: monthEnd } },
      _sum: { forwardCount: true, reverseCount: true },
    }),
    prisma.monthlyPricing.findUnique({ where: { year_month: { year, month } } }),
    getAllEmployeesMonthlySalary(year, month),
    prisma.financeRecord.findMany({
      where: { date: { gte: monthStart, lt: monthEnd }, status: "APPROVED", type: { in: ["INCOME", "EXPENSE"] } },
      select: { type: true, categoryId: true, amount: true },
    }),
    prisma.financeCategory.findMany({ select: { id: true, name: true, kind: true, group: true } }),
  ]);
  const forward = deliveries._sum.forwardCount ?? 0;
  const reverse = deliveries._sum.reverseCount ?? 0;
  const groups = categoryGroupMap(categories);
  const salaryNames = new Set([IMPORT_CATEGORY_NAMES.salary, "績效獎金"]);
  const salaryIds = new Set(
    categories.filter((c) => c.kind === "EXPENSE" && salaryNames.has(c.name)).map((c) => c.id)
  );
  let actualRevenue = 0;
  let actualSalaryCost = 0;
  for (const r of records) {
    if (r.type === "INCOME" && r.categoryId && groups.get(r.categoryId) === "REVENUE") actualRevenue += r.amount;
    if (r.type === "EXPENSE" && r.categoryId && salaryIds.has(r.categoryId)) actualSalaryCost += r.amount;
  }
  return {
    estimatedRevenue: pricing ? forward * pricing.forwardPrice + reverse * pricing.reversePrice : null,
    estimatedSalaryCost: salaries.reduce((sum, s) => sum + s.totalSalary, 0),
    actualRevenue,
    actualSalaryCost,
  };
}

export async function getMonthlyFinanceReport(
  year: number,
  month: number
): Promise<MonthlyFinanceReport> {
  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);
  const prevStart = month === 1 ? startOfMonth(year - 1, 12) : startOfMonth(year, month - 1);

  // 報表一律只計已核准帳目（待審核／已駁回不入帳）
  const [monthRecords, allRecordsThroughMonth, categories, shareholders, prevRecords, pendingAgg] =
    await Promise.all([
    prisma.financeRecord.findMany({
      where: { date: { gte: monthStart, lt: monthEnd }, status: "APPROVED" },
      include: recordInclude,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.financeRecord.findMany({
      where: { date: { lt: monthEnd }, status: "APPROVED" },
      select: { type: true, partyId: true, counterPartyId: true, categoryId: true, amount: true },
    }),
    prisma.financeCategory.findMany({ select: { id: true, name: true, kind: true, group: true } }),
    getSettlementParties(),
    prisma.financeRecord.findMany({
      where: { date: { gte: prevStart, lt: monthStart }, status: "APPROVED" },
      select: { type: true, partyId: true, counterPartyId: true, categoryId: true, amount: true },
    }),
    prisma.financeRecord.aggregate({
      where: { date: { gte: monthStart, lt: monthEnd }, status: "PENDING" },
      _count: true,
      _sum: { amount: true },
    }),
  ]);

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const groupByCategory = categoryGroupMap(categories);

  const settlement = computeSettlement(monthRecords, shareholders);
  const cumulativeSettlement = computeSettlement(allRecordsThroughMonth, shareholders);

  // 停用股東若無任何往來就不顯示
  const hasActivity = (r: SettlementRow) => r.advanced !== 0 || r.received !== 0;
  const activeIds = new Set(shareholders.filter((s) => s.isActive).map((s) => s.id));
  const visible = (rows: SettlementRow[]) =>
    rows.filter((r) => activeIds.has(r.partyId) || hasActivity(r));

  return {
    year,
    month,
    summary: computeProfitSummary(monthRecords),
    profit: computeGroupedProfit(monthRecords, groupByCategory),
    prevProfit: computeGroupedProfit(prevRecords, groupByCategory),
    categoryBreakdown: buildCategoryBreakdown(monthRecords, prevRecords, categories),
    pending: { count: pendingAgg._count, amount: pendingAgg._sum.amount ?? 0 },
    expenseByCategory: summarizeByCategory(monthRecords, "EXPENSE", categoryNames),
    incomeByCategory: summarizeByCategory(monthRecords, "INCOME", categoryNames),
    records: monthRecords.map((r) => ({
      id: r.id,
      date: toDateOnlyString(r.date),
      type: r.type,
      partyName: r.party.name,
      counterPartyName: r.counterParty?.name ?? null,
      categoryName: r.category?.name ?? null,
      amount: r.amount,
      note: r.note,
      sourceType: r.sourceType,
    })),
    settlement: visible(settlement),
    cumulativeSettlement: visible(cumulativeSettlement),
  };
}

export interface FinanceAllTimeOverview {
  firstDate: string | null; // 最早帳目日期（YYYY-MM-DD）
  lastDate: string | null; // 最晚帳目日期
  recordCount: number;
  summary: ProfitSummary; // 所有時期損益（排除內部撥款）＝公司整體累計淨額
  settlement: SettlementRow[]; // 各股東所有時期：代墊支出／領回金額／剩餘結算
  funds: FundBalanceRow[]; // 公款／非股東關係人現金餘額（如「旭寺公款」）
  expenseByCategory: CategorySummaryRow[]; // 所有時期支出分類彙總
  incomeByCategory: CategorySummaryRow[];
}

// 總覽（所有時期）：全期間損益＋股東結算＋公款餘額＋分類彙總
export async function getFinanceAllTimeOverview(): Promise<FinanceAllTimeOverview> {
  const [records, categories, shareholders, funds] = await Promise.all([
    prisma.financeRecord.findMany({
      where: { status: "APPROVED" },
      select: {
        date: true,
        type: true,
        partyId: true,
        counterPartyId: true,
        categoryId: true,
        amount: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.financeCategory.findMany({ select: { id: true, name: true } }),
    getSettlementParties(),
    getFundParties(),
  ]);

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const settlement = computeSettlement(records, shareholders);
  const activeIds = new Set(shareholders.filter((s) => s.isActive).map((s) => s.id));
  const fundBalances = computeFundBalances(records, funds);
  const activeFundIds = new Set(funds.filter((f) => f.isActive).map((f) => f.id));

  return {
    firstDate: records.length > 0 ? toDateOnlyString(records[0].date) : null,
    lastDate: records.length > 0 ? toDateOnlyString(records[records.length - 1].date) : null,
    recordCount: records.length,
    summary: computeProfitSummary(records),
    settlement: settlement.filter(
      (r) => activeIds.has(r.partyId) || r.advanced !== 0 || r.received !== 0
    ),
    funds: fundBalances.filter((f) => activeFundIds.has(f.partyId) || f.balance !== 0),
    expenseByCategory: summarizeByCategory(records, "EXPENSE", categoryNames),
    incomeByCategory: summarizeByCategory(records, "INCOME", categoryNames),
  };
}

export interface YearlyOverviewRow extends GroupedProfit {
  month: number;
  incomeTotal: number;
  expenseTotal: number;
  recordCount: number;
}

export interface YearlyFinanceOverview {
  year: number;
  months: YearlyOverviewRow[];
  total: GroupedProfit & { incomeTotal: number; expenseTotal: number };
}

export async function getYearlyFinanceOverview(year: number): Promise<YearlyFinanceOverview> {
  const [records, categories] = await Promise.all([
    prisma.financeRecord.findMany({
      where: {
        date: { gte: startOfMonth(year, 1), lt: startOfMonth(year + 1, 1) },
        status: "APPROVED",
      },
      select: { date: true, type: true, partyId: true, counterPartyId: true, categoryId: true, amount: true },
    }),
    prisma.financeCategory.findMany({ select: { id: true, kind: true, group: true } }),
  ]);
  const groupByCategory = categoryGroupMap(categories);

  const byMonth: (typeof records)[] = Array.from({ length: 12 }, () => []);
  for (const r of records) byMonth[r.date.getUTCMonth()].push(r);

  // net 由 computeGroupedProfit 提供，與 computeProfitSummary.net 相同
  const months: YearlyOverviewRow[] = byMonth.map((rs, i) => {
    const summary = computeProfitSummary(rs);
    return {
      month: i + 1,
      incomeTotal: summary.incomeTotal,
      expenseTotal: summary.expenseTotal,
      recordCount: rs.length,
      ...computeGroupedProfit(rs, groupByCategory),
    };
  });

  const summary = computeProfitSummary(records);
  return {
    year,
    months,
    total: {
      incomeTotal: summary.incomeTotal,
      expenseTotal: summary.expenseTotal,
      ...computeGroupedProfit(records, groupByCategory),
    },
  };
}

export interface MonthEndCash {
  funds: FundBalanceRow[]; // 公款／非股東關係人至當月月底的現金餘額
  cumulativeNet: number; // 開帳以來至當月月底的公司累計淨額（排除內部撥款）
}

// 月底現金：與「所有時期」相同算法，但只算到指定月份月底（供報表呈現當時狀態）
export async function getMonthEndCash(year: number, month: number): Promise<MonthEndCash> {
  const [records, funds] = await Promise.all([
    prisma.financeRecord.findMany({
      where: { date: { lt: startOfNextMonth(year, month) }, status: "APPROVED" },
      select: { type: true, partyId: true, counterPartyId: true, categoryId: true, amount: true },
    }),
    getFundParties(),
  ]);
  const activeFundIds = new Set(funds.filter((f) => f.isActive).map((f) => f.id));
  return {
    funds: computeFundBalances(records, funds).filter((f) => activeFundIds.has(f.partyId) || f.balance !== 0),
    cumulativeNet: computeProfitSummary(records).net,
  };
}
