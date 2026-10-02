import { prisma } from "../lib/prisma";
import { parseDateOnly, toDateOnlyString } from "../utils/date";
import { getAllEmployeesMonthlySalary } from "./salaryService";
import { detectAnomalies, WINDOW_DAYS } from "./anomalyService";

// 週報：某一週（週一到週日）的件數、預估營收、油資／停車費／維修花費、每人件數，和前一週比；
// 另附該週所在月份到目前的預估薪資、該週的資料異常與目前待處理件數。全部用既有資料即時算。

export interface WeekTotals {
  forward: number;
  reverse: number;
  total: number;
  attendance: number; // 出勤人次（送件紀錄筆數）
  people: number; // 出勤人數（不重複）
  revenue: number | null; // 預估營收（件數 × 該月實拿單價）；整週都沒有單價時為 null
  revenueComplete: boolean; // 有某天的月份沒設定單價時為 false（營收只算有單價的天）
  fuel: number; // 加油回報（待審核＋已核准，依加油日期）
  parking: number;
  maintenance: number; // 維修履歷花費（依維修日期）
}

export interface WeeklyReport {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  days: { date: string; forward: number; reverse: number; attendance: number }[];
  totals: WeekTotals;
  prev: WeekTotals;
  pendingExpenseCount: number; // 本週的加油／停車費還有幾筆待審核
  employees: { userId: string; name: string; days: number; forward: number; reverse: number; total: number; avg: number }[];
  absent: string[]; // 本週沒有任何送件紀錄的在職員工（不含董事長）
  missingPricing: string[]; // 沒設定單價的月份（YYYY-MM）
  salary: { year: number; month: number; total: number; locked: boolean };
  anomalies: number | null; // 本週還沒確認的資料異常；超出檢查範圍（太久以前）為 null
  pendingReviews: number; // 目前待審核（油資、停車費、請假）
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// 該日期所在那一週的週一（UTC 日期）
export function mondayOf(date: Date): Date {
  return addDays(date, -((date.getUTCDay() + 6) % 7));
}

export async function buildWeeklyReport(start: Date, now = new Date()): Promise<WeeklyReport> {
  const end = addDays(start, 6);
  const prevStart = addDays(start, -7);
  const rangeEnd = addDays(end, 1);
  const startStr = toDateOnlyString(start);
  const endStr = toDateOnlyString(end);

  const months = new Map<string, { year: number; month: number }>();
  for (let d = prevStart; d < rangeEnd; d = addDays(d, 1)) {
    months.set(toDateOnlyString(d).slice(0, 7), { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }

  const [deliveries, pricing, fuel, parking, logs, activeUsers, pendingCounts] = await Promise.all([
    prisma.deliveryRecord.findMany({
      where: { date: { gte: prevStart, lt: rangeEnd } },
      select: { userId: true, date: true, forwardCount: true, reverseCount: true, user: { select: { name: true } } },
    }),
    prisma.monthlyPricing.findMany({ where: { OR: [...months.values()] } }),
    prisma.fuelReport.findMany({
      where: { date: { gte: prevStart, lt: rangeEnd }, status: { not: "REJECTED" } },
      select: { date: true, amount: true, status: true },
    }),
    prisma.parkingFeeReport.findMany({
      where: { date: { gte: prevStart, lt: rangeEnd }, status: { not: "REJECTED" } },
      select: { date: true, amount: true, status: true },
    }),
    prisma.maintenanceLog.findMany({ where: { date: { gte: prevStart, lt: rangeEnd } }, select: { date: true, cost: true } }),
    prisma.user.findMany({ where: { isActive: true, role: { not: "ADMIN" } }, select: { id: true, name: true } }),
    Promise.all([
      prisma.fuelReport.count({ where: { status: "PENDING" } }),
      prisma.parkingFeeReport.count({ where: { status: "PENDING" } }),
      prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    ]),
  ]);

  const priceOf = new Map(pricing.map((p) => [`${p.year}-${String(p.month).padStart(2, "0")}`, p]));
  const missingPricing = new Set<string>();
  const inWeek = (d: Date, s: Date) => d >= s && d < addDays(s, 7);

  function totalsFor(s: Date): WeekTotals {
    const rows = deliveries.filter((r) => inWeek(r.date, s));
    let revenue = 0;
    let priced = 0;
    for (const r of rows) {
      const ym = toDateOnlyString(r.date).slice(0, 7);
      const p = priceOf.get(ym);
      if (!p) {
        missingPricing.add(ym);
        continue;
      }
      revenue += r.forwardCount * p.forwardPrice + r.reverseCount * p.reversePrice;
      priced++;
    }
    const sum = <T>(list: T[], f: (x: T) => number) => list.reduce((acc, x) => acc + f(x), 0);
    return {
      forward: sum(rows, (r) => r.forwardCount),
      reverse: sum(rows, (r) => r.reverseCount),
      total: sum(rows, (r) => r.forwardCount + r.reverseCount),
      attendance: rows.length,
      people: new Set(rows.map((r) => r.userId)).size,
      revenue: priced > 0 ? Math.round(revenue) : rows.length === 0 ? 0 : null,
      revenueComplete: priced === rows.length,
      fuel: sum(fuel.filter((f) => inWeek(f.date, s)), (f) => f.amount),
      parking: sum(parking.filter((f) => inWeek(f.date, s)), (f) => f.amount),
      maintenance: sum(logs.filter((l) => inWeek(l.date, s)), (l) => l.cost),
    };
  }

  const totals = totalsFor(start);
  const prev = totalsFor(prevStart);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const key = toDateOnlyString(d);
    const rows = deliveries.filter((r) => toDateOnlyString(r.date) === key);
    return {
      date: key,
      forward: rows.reduce((s, r) => s + r.forwardCount, 0),
      reverse: rows.reduce((s, r) => s + r.reverseCount, 0),
      attendance: rows.length,
    };
  });

  const byUser = new Map<string, WeeklyReport["employees"][number]>();
  for (const r of deliveries.filter((x) => inWeek(x.date, start))) {
    const e = byUser.get(r.userId) ?? { userId: r.userId, name: r.user.name, days: 0, forward: 0, reverse: 0, total: 0, avg: 0 };
    e.days++;
    e.forward += r.forwardCount;
    e.reverse += r.reverseCount;
    e.total += r.forwardCount + r.reverseCount;
    byUser.set(r.userId, e);
  }
  const employees = [...byUser.values()]
    .map((e) => ({ ...e, avg: Math.round((e.total / e.days) * 10) / 10 }))
    .sort((a, b) => b.total - a.total);
  const absent = activeUsers.filter((u) => !byUser.has(u.id)).map((u) => u.name);

  // 該週週日所在月份到目前的預估薪資（已封存則為封存金額）
  const salaryYear = end.getUTCFullYear();
  const salaryMonth = end.getUTCMonth() + 1;
  const salary = await getAllEmployeesMonthlySalary(salaryYear, salaryMonth);

  // 資料異常只檢查最近 WINDOW_DAYS 天；整週都在範圍內才算得準
  const today = parseDateOnly(toDateOnlyString(now));
  const windowStart = addDays(today, -(WINDOW_DAYS - 1));
  let anomalies: number | null = null;
  if (start >= windowStart) {
    const { items } = await detectAnomalies(now);
    anomalies = items.filter((a) => !a.dismissed && a.date >= startStr && a.date <= endStr).length;
  }

  return {
    start: startStr,
    end: endStr,
    prevStart: toDateOnlyString(prevStart),
    prevEnd: toDateOnlyString(addDays(start, -1)),
    days,
    totals,
    prev,
    pendingExpenseCount:
      fuel.filter((f) => inWeek(f.date, start) && f.status === "PENDING").length +
      parking.filter((f) => inWeek(f.date, start) && f.status === "PENDING").length,
    employees,
    absent,
    missingPricing: [...missingPricing].sort(),
    salary: {
      year: salaryYear,
      month: salaryMonth,
      total: Math.round(salary.salaries.reduce((s, x) => s + x.totalSalary, 0)),
      locked: salary.locked,
    },
    anomalies,
    pendingReviews: pendingCounts.reduce((a, b) => a + b, 0),
  };
}
