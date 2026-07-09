// 記帳模組：月報／年度總覽資料組裝（供 API、Excel、PDF 共用）

import { prisma } from "../lib/prisma";
import { startOfMonth, startOfNextMonth, toDateOnlyString } from "../utils/date";
import {
  computeProfitSummary,
  computeSettlement,
  summarizeByCategory,
  type CategorySummaryRow,
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

export interface MonthlyFinanceReport {
  year: number;
  month: number;
  summary: ProfitSummary;
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

export async function getMonthlyFinanceReport(
  year: number,
  month: number
): Promise<MonthlyFinanceReport> {
  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);

  // 報表一律只計已核准帳目（待審核／已駁回不入帳）
  const [monthRecords, allRecordsThroughMonth, categories, shareholders] = await Promise.all([
    prisma.financeRecord.findMany({
      where: { date: { gte: monthStart, lt: monthEnd }, status: "APPROVED" },
      include: recordInclude,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.financeRecord.findMany({
      where: { date: { lt: monthEnd }, status: "APPROVED" },
      select: { type: true, partyId: true, counterPartyId: true, categoryId: true, amount: true },
    }),
    prisma.financeCategory.findMany({ select: { id: true, name: true } }),
    getSettlementParties(),
  ]);

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

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
  summary: ProfitSummary; // 所有時期損益（排除內部撥款）
  settlement: SettlementRow[]; // 各股東所有時期：代墊支出／領回金額／剩餘結算
  expenseByCategory: CategorySummaryRow[]; // 所有時期支出分類彙總
  incomeByCategory: CategorySummaryRow[];
}

// 總覽（所有時期）：全期間損益＋股東結算＋分類彙總
export async function getFinanceAllTimeOverview(): Promise<FinanceAllTimeOverview> {
  const [records, categories, shareholders] = await Promise.all([
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
  ]);

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const settlement = computeSettlement(records, shareholders);
  const activeIds = new Set(shareholders.filter((s) => s.isActive).map((s) => s.id));

  return {
    firstDate: records.length > 0 ? toDateOnlyString(records[0].date) : null,
    lastDate: records.length > 0 ? toDateOnlyString(records[records.length - 1].date) : null,
    recordCount: records.length,
    summary: computeProfitSummary(records),
    settlement: settlement.filter(
      (r) => activeIds.has(r.partyId) || r.advanced !== 0 || r.received !== 0
    ),
    expenseByCategory: summarizeByCategory(records, "EXPENSE", categoryNames),
    incomeByCategory: summarizeByCategory(records, "INCOME", categoryNames),
  };
}

export interface YearlyOverviewRow {
  month: number;
  incomeTotal: number;
  expenseTotal: number;
  net: number;
  recordCount: number;
}

export interface YearlyFinanceOverview {
  year: number;
  months: YearlyOverviewRow[];
  total: { incomeTotal: number; expenseTotal: number; net: number };
}

export async function getYearlyFinanceOverview(year: number): Promise<YearlyFinanceOverview> {
  const records = await prisma.financeRecord.findMany({
    where: {
      date: { gte: startOfMonth(year, 1), lt: startOfMonth(year + 1, 1) },
      status: "APPROVED",
    },
    select: { date: true, type: true, amount: true },
  });

  const months: YearlyOverviewRow[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    incomeTotal: 0,
    expenseTotal: 0,
    net: 0,
    recordCount: 0,
  }));

  for (const r of records) {
    const row = months[r.date.getUTCMonth()];
    row.recordCount += 1;
    if (r.type === "INCOME") row.incomeTotal += r.amount;
    else if (r.type === "EXPENSE") row.expenseTotal += r.amount;
  }
  for (const row of months) row.net = row.incomeTotal - row.expenseTotal;

  const total = {
    incomeTotal: months.reduce((s, m) => s + m.incomeTotal, 0),
    expenseTotal: months.reduce((s, m) => s + m.expenseTotal, 0),
    net: 0,
  };
  total.net = total.incomeTotal - total.expenseTotal;

  return { year, months, total };
}
