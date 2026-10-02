import { prisma } from "../lib/prisma";
import { startOfMonth, startOfNextMonth, toDateOnlyString } from "../utils/date";
import { getSalaryMonthLock } from "./salaryService";
import { getImportCenterStatus } from "./financeImportService";
import { installmentsInMonth, loanSourceId } from "./assetService";
import { detectAnomalies, WINDOW_DAYS } from "./anomalyService";

// 月底結算清單：把月底要跑的幾個頁面照順序列出，每一步都由系統即時檢查做了沒（不用手動打勾）。
// 只是把現有頁面串起來，不改任何流程；每一步附上直接前往的連結。

export type ClosingStatus = "done" | "todo" | "waiting" | "skip";

export interface ClosingStep {
  key: string;
  title: string;
  status: ClosingStatus; // done＝完成、todo＝要處理、waiting＝建議等前面做完、skip＝這個月不適用
  detail: string;
  to: string;
  action: string; // 連結文字
}

export interface ClosingChecklist {
  year: number;
  month: number;
  steps: ClosingStep[];
  done: number;
  total: number; // 不含 skip
}

function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export async function buildClosingChecklist(year: number, month: number, now = new Date()): Promise<ClosingChecklist> {
  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);
  const ym = `year=${year}&month=${month}`;

  const [pricing, fuelPending, parkingPending, leavePending, lock, loanAssets, pendingFinance, importStatus] = await Promise.all([
    prisma.monthlyPricing.findUnique({ where: { year_month: { year, month } } }),
    prisma.fuelReport.count({ where: { status: "PENDING", date: { gte: monthStart, lt: monthEnd } } }),
    prisma.parkingFeeReport.count({ where: { status: "PENDING", date: { gte: monthStart, lt: monthEnd } } }),
    prisma.leaveRequest.count({ where: { status: "PENDING", date: { gte: monthStart, lt: monthEnd } } }),
    getSalaryMonthLock(year, month),
    prisma.asset.findMany({ where: { hasLoan: true } }),
    prisma.financeRecord.count({ where: { status: "PENDING", date: { gte: monthStart, lt: monthEnd } } }),
    getImportCenterStatus(year, month, { withWarnings: false }),
  ]);

  const steps: ClosingStep[] = [];

  // 1. 收入單價
  steps.push({
    key: "pricing",
    title: "設定收入單價",
    status: pricing ? "done" : "todo",
    detail: pricing
      ? `正物流 $${pricing.forwardPrice}、逆物流 $${pricing.reversePrice}`
      : `還沒設定 ${month} 月的正／逆物流實拿單價，營收與毛利都算不出來`,
    to: "/admin/settings",
    action: "去設定",
  });

  // 2. 資料檢查（只檢查最近 WINDOW_DAYS 天；整個月都太久以前就略過）
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86400000);
  let checksOpen = 0;
  if (monthEnd > windowStart) {
    const { items } = await detectAnomalies(now);
    const from = toDateOnlyString(monthStart);
    const to = toDateOnlyString(new Date(monthEnd.getTime() - 86400000));
    checksOpen = items.filter((a) => !a.dismissed && a.date >= from && a.date <= to).length;
    steps.push({
      key: "checks",
      title: "確認可能打錯的資料",
      status: checksOpen === 0 ? "done" : "todo",
      detail: checksOpen === 0 ? "沒有待確認的件數、里程或報帳" : `還有 ${checksOpen} 筆可能打錯，會影響薪資或油資`,
      to: "/admin?tab=checks",
      action: "去確認",
    });
  } else {
    steps.push({
      key: "checks",
      title: "確認可能打錯的資料",
      status: "skip",
      detail: `資料檢查只看最近 ${WINDOW_DAYS} 天，這個月太久以前了`,
      to: "/admin?tab=checks",
      action: "看資料檢查",
    });
  }

  // 3. 審核
  const reviewTotal = fuelPending + parkingPending + leavePending;
  const reviewParts = [
    fuelPending && `油資 ${fuelPending}`,
    parkingPending && `停車費 ${parkingPending}`,
    leavePending && `請假 ${leavePending}`,
  ].filter(Boolean);
  steps.push({
    key: "review",
    title: "審核油資、停車費、請假",
    status: reviewTotal === 0 ? "done" : "todo",
    detail: reviewTotal === 0 ? "這個月的申請都處理完了" : `還有 ${reviewTotal} 筆待審核（${reviewParts.join("、")}），核准的油資與停車費會計入薪資`,
    to: "/review",
    action: "去審核",
  });

  // 4. 封存薪資（審核與資料檢查做完再封存，避免封存後又要改）
  const blocked = reviewTotal > 0 || checksOpen > 0;
  steps.push({
    key: "salary",
    title: `確認並封存 ${month} 月薪資`,
    status: lock ? "done" : blocked ? "waiting" : "todo",
    detail: lock
      ? `已於 ${toDateOnlyString(lock.lockedAt)} 封存，之後補登的資料不會改到這個月的薪資`
      : blocked
        ? "建議先完成上面的審核與資料確認再封存"
        : "確認每個人的件數與扣款後封存，封存後才能把薪資帶入記帳",
    to: `/admin/salary?tab=calc&${ym}`,
    action: lock ? "看薪資" : "去封存",
  });

  // 5. 車貸
  const dues = loanAssets.flatMap((a) =>
    installmentsInMonth(a, year, month).map((i) => ({ sourceId: loanSourceId(a.id, i.no), amount: i.amount }))
  );
  if (dues.length === 0) {
    steps.push({ key: "loan", title: "車貸帶入記帳", status: "skip", detail: "這個月沒有到期的分期", to: `/admin/assets?tab=dues&${ym}`, action: "看本月應繳" });
  } else {
    const ids = dues.map((d) => d.sourceId);
    const [linked, skipped] = await Promise.all([
      prisma.financeSourceLink.findMany({ where: { sourceType: "LOAN_PAYMENT", sourceId: { in: ids } }, select: { sourceId: true } }),
      prisma.financeIgnoredSource.findMany({ where: { sourceType: "LOAN_PAYMENT", sourceId: { in: ids } }, select: { sourceId: true } }),
    ]);
    const handled = new Set([...linked, ...skipped].map((r) => r.sourceId));
    const left = dues.filter((d) => !handled.has(d.sourceId));
    steps.push({
      key: "loan",
      title: "車貸帶入記帳",
      status: left.length === 0 ? "done" : "todo",
      detail:
        left.length === 0
          ? `${dues.length} 期都已帶入或標記為已另外記帳`
          : `還有 ${left.length} 期 ${money(left.reduce((s, d) => s + d.amount, 0))} 沒帶入記帳`,
      to: `/admin/assets?tab=dues&${ym}`,
      action: "去帶入",
    });
  }

  // 6. 帶入中心（油資、停車費、維修、薪資）；薪資要封存後才能帶入
  const blocks = [
    ["油資", importStatus.fuel],
    ["停車費", importStatus.parking],
    ["維修", importStatus.maintenance],
    ["薪資", importStatus.salary],
  ] as const;
  const pendingParts = blocks.filter(([, b]) => b.pending.length > 0).map(([name, b]) => `${name} ${b.pending.length} 筆`);
  const salaryWaiting = !lock;
  steps.push({
    key: "import",
    title: "帶入記帳（油資、停車費、維修、薪資）",
    status: pendingParts.length > 0 ? "todo" : salaryWaiting ? "waiting" : "done",
    detail:
      pendingParts.length > 0
        ? `還有可帶入的項目：${pendingParts.join("、")}${salaryWaiting ? "（薪資要先封存才會出現）" : ""}`
        : salaryWaiting
          ? "薪資封存後才能帶入薪資"
          : "這個月的來源都已帶入或標記不帶入",
    to: `/admin/finance/import?${ym}`,
    action: "去帶入",
  });

  // 7. 記帳核准
  steps.push({
    key: "finance",
    title: "核准記帳",
    status: pendingFinance === 0 ? "done" : "todo",
    detail: pendingFinance === 0 ? "沒有待核准的帳目" : `還有 ${pendingFinance} 筆帳目待核准，核准後才計入帳務月報`,
    to: `/admin/finance?${ym}&status=PENDING`,
    action: "去核准",
  });

  const counted = steps.filter((s) => s.status !== "skip");
  return { year, month, steps, done: counted.filter((s) => s.status === "done").length, total: counted.length };
}
