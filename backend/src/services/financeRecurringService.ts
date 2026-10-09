import { prisma } from "../lib/prisma";
import { startOfMonth, taipeiParts } from "../utils/date";

// 固定收支範本：每月固定的房租、電話、保險、會計費…，選月份一鍵帶入記帳。
// 每個範本每個月只會帶入一次（FinanceRecurringRun），帳目被刪掉後那個月可以再帶入；也可以標記「這個月不用」。

// 範本在某年月的帳目日期：每月幾號，超過當月天數以月底計
export function dueDateOf(year: number, month: number, dayOfMonth: number): Date {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(Math.max(1, dayOfMonth), lastDay)));
}

export type RecurringMonthState = "applied" | "skipped" | "due" | "upcoming";

export async function listRecurringForMonth(year: number, month: number, now: Date = new Date()) {
  const [templates, runs] = await Promise.all([
    prisma.financeRecurring.findMany({
      include: { party: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { dayOfMonth: "asc" }, { createdAt: "asc" }],
    }),
    prisma.financeRecurringRun.findMany({ where: { year, month } }),
  ]);
  const runBy = new Map(runs.map((r) => [r.recurringId, r]));
  const tw = taipeiParts(now);
  const thisMonthStart = startOfMonth(tw.year, tw.month);
  const target = startOfMonth(year, month);
  return templates.map((t) => {
    const run = runBy.get(t.id);
    const due = dueDateOf(year, month, t.dayOfMonth);
    // 過去的月份都算到期；本月要過了繳款日才算；未來的月份還沒到
    const isDue = target < thisMonthStart || (target.getTime() === thisMonthStart.getTime() && tw.day >= due.getUTCDate());
    const state: RecurringMonthState = run ? (run.recordId ? "applied" : "skipped") : isDue ? "due" : "upcoming";
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      amount: t.amount,
      dayOfMonth: t.dayOfMonth,
      note: t.note,
      isActive: t.isActive,
      party: t.party,
      category: t.category,
      dueDate: due.toISOString(),
      state,
      recordId: run?.recordId ?? null,
    };
  });
}

// 本月已到期、還沒帶入也沒略過的啟用中範本數（首頁提醒用）
export async function dueRecurringCount(now: Date = new Date()): Promise<{ count: number; names: string[] }> {
  const tw = taipeiParts(now);
  const items = await listRecurringForMonth(tw.year, tw.month, now);
  const due = items.filter((i) => i.isActive && i.state === "due");
  return { count: due.length, names: due.map((d) => d.name) };
}
