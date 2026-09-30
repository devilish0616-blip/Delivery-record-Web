// 記帳模組：帳務月報 HTML 報表（單一 .html 檔，圖表以內嵌 SVG／CSS 繪製，瀏覽器開啟即可閱讀，
// 列印時依 A4 分頁並附頁碼，可直接「另存為 PDF」）。舊版 PDF 仍保留作為與舊系統對帳用。

import {
  getMonthEndCash,
  getMonthlyFinanceReport,
  getOperationsEstimate,
  getYearlyFinanceOverview,
  type CategoryBreakdownRow,
  type MonthEndCash,
  type MonthlyFinanceReport,
  type OperationsEstimate,
  type YearlyFinanceOverview,
} from "./financeReportService";

const COMPANY = "旭寺物流有限公司";

export interface FinanceHtmlReportData {
  report: MonthlyFinanceReport;
  estimate: OperationsEstimate | null;
  yearly: YearlyFinanceOverview;
  cash: MonthEndCash;
  generatedAt: Date;
}

export async function generateFinanceReportHtml(year: number, month: number): Promise<string> {
  const [report, estimate, yearly, cash] = await Promise.all([
    getMonthlyFinanceReport(year, month),
    getOperationsEstimate(year, month).catch(() => null),
    getYearlyFinanceOverview(year),
    getMonthEndCash(year, month),
  ]);
  return renderFinanceReportHtml({ report, estimate, yearly, cash, generatedAt: new Date() });
}

// ─── 格式工具 ────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(n: number): string {
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}

function signedMoney(n: number): string {
  return (n > 0 ? "+" : "") + money(n);
}

function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

// 較上月變動百分比；上月為 0 時無法比較
function changeRate(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function arrow(n: number): string {
  return n > 0 ? "▲" : n < 0 ? "▼" : "";
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${date.slice(5).replace("-", "/")}（${WEEKDAYS[d.getUTCDay()]}）`;
}

function taipeiDate(d: Date): string {
  return d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
}

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "手動",
  IMPORT: "舊系統匯入",
  FUEL_REPORT: "加油回報",
  PARKING_FEE_REPORT: "停車費回報",
  MAINTENANCE_LOG: "維修履歷",
  SALARY_SNAPSHOT: "薪資封存",
};

const GROUP_LABELS: Record<string, string> = {
  REVENUE: "營業收入",
  OTHER_INCOME: "其他收入",
  DIRECT_COST: "直接成本",
  OPERATING_EXPENSE: "營業費用",
  OTHER_EXPENSE: "其他支出",
};

// 暖色＝直接成本、藍灰＝營業費用、灰＝其他支出
const PALETTES: Record<string, string[]> = {
  DIRECT_COST: ["#9a3412", "#c2410c", "#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa"],
  OPERATING_EXPENSE: ["#1e3a8a", "#3b5bb5", "#6b87cf", "#9fb2e3", "#cdd7f0", "#e0e7f7"],
  OTHER_EXPENSE: ["#475569", "#94a3b8", "#cbd5e1"],
};

function sectionTitle(title: string, hint?: string): string {
  return `<div class="sec-title"><h2>${esc(title)}</h2>${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</div>`;
}

// ─── 各區塊 ──────────────────────────────────────────────────────────────────

function buildConclusion(report: MonthlyFinanceReport, highlights: Highlight[]): string {
  const p = report.profit;
  const prev = report.prevProfit;
  const parts: string[] = [];
  if (p.revenue > 0) {
    const margin = (p.grossProfit / p.revenue) * 100;
    let marginDelta = "";
    if (prev.revenue > 0) {
      const d = margin - (prev.grossProfit / prev.revenue) * 100;
      if (Math.abs(d) >= 0.05) {
        marginDelta = `，較上月 <b class="${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "＋" : "－"}${Math.abs(d).toFixed(1)} 個百分點</b>`;
      }
    }
    parts.push(
      `本月營業收入 <b class="mono">${money(p.revenue)}</b>，毛利 <b class="mono">${money(p.grossProfit)}</b>（毛利率 <b>${pct(margin)}</b>${marginDelta}）。`
    );
    parts.push(
      `扣除營業費用後營業利益 <b class="mono">${money(p.operatingProfit)}</b>，淨損益 <b class="mono ${p.net >= 0 ? "pos" : "neg"}">${money(p.net)}</b>。`
    );
  } else {
    parts.push(
      `本月尚無營業收入入帳，收入合計 <b class="mono">${money(report.summary.incomeTotal)}</b>、支出合計 <b class="mono">${money(report.summary.expenseTotal)}</b>，淨損益 <b class="mono ${p.net >= 0 ? "pos" : "neg"}">${money(p.net)}</b>。`
    );
  }
  const rising = highlights.filter((h) => h.kind === "EXPENSE" && h.rate !== null && h.rate >= 20);
  if (rising.length > 0) {
    const h = rising[0];
    parts.push(`${esc(GROUP_LABELS[h.group] ?? "")}中「${esc(h.name)}」較上月增加 ${Math.round(h.rate!)}%，建議留意。`);
  }
  if (report.pending.count > 0) {
    parts.push(`另有 ${report.pending.count} 筆待審核帳目（${money(report.pending.amount)}）未計入本報表。`);
  }
  return `<section class="conclusion">${parts.join("")}</section>`;
}

function buildKpis(report: MonthlyFinanceReport): string {
  const p = report.profit;
  const prev = report.prevProfit;
  const revRate = changeRate(p.revenue, prev.revenue);
  const margin = p.revenue > 0 ? (p.grossProfit / p.revenue) * 100 : null;
  const prevMargin = prev.revenue > 0 ? (prev.grossProfit / prev.revenue) * 100 : null;
  const opMargin = p.revenue > 0 ? (p.operatingProfit / p.revenue) * 100 : null;
  const netDelta = p.net - prev.net;
  const tone = (n: number | null) => (n === null || n === 0 ? "muted" : n > 0 ? "pos" : "neg");

  const cards = [
    {
      label: "營業收入",
      value: money(p.revenue),
      sub: revRate === null ? "上月無資料" : `較上月 ${arrow(revRate)}${Math.abs(revRate).toFixed(1)}%`,
      subTone: tone(revRate),
      dark: false,
    },
    {
      label: "毛利・毛利率",
      value: money(p.grossProfit),
      sub:
        margin === null
          ? "無營業收入"
          : `${pct(margin)}${prevMargin === null ? "" : `・較上月 ${arrow(margin - prevMargin)}${Math.abs(margin - prevMargin).toFixed(1)}pt`}`,
      subTone: "",
      dark: true,
    },
    {
      label: "營業利益",
      value: money(p.operatingProfit),
      sub: opMargin === null ? "—" : `營業利益率 ${pct(opMargin)}`,
      subTone: "muted",
      dark: false,
    },
    {
      label: "淨損益",
      value: money(p.net),
      sub: `較上月 ${arrow(netDelta)}${money(Math.abs(netDelta))}`,
      subTone: tone(netDelta),
      dark: false,
    },
  ];
  return `<section class="kpis">${cards
    .map(
      (c) => `<div class="kpi${c.dark ? " dark" : ""}"><div class="kpi-label">${esc(c.label)}</div><div class="kpi-value mono${!c.dark && c.value.startsWith("-") ? " neg" : ""}">${c.value}</div><div class="kpi-sub ${c.subTone}">${c.sub}</div></div>`
    )
    .join("")}</section>`;
}

function buildWaterfall(report: MonthlyFinanceReport): string {
  const p = report.profit;
  const other = p.otherIncome - p.otherExpense;
  type Step = { label: string; kind: "total" | "key" | "minus" | "plus"; from: number; to: number; value: number };
  const steps: Step[] = [
    { label: "營業收入", kind: "total", from: 0, to: p.revenue, value: p.revenue },
    { label: "− 直接成本", kind: "minus", from: p.revenue, to: p.grossProfit, value: -p.directCost },
    { label: "毛利", kind: "key", from: 0, to: p.grossProfit, value: p.grossProfit },
    { label: "− 營業費用", kind: "minus", from: p.grossProfit, to: p.operatingProfit, value: -p.operatingExpense },
    { label: "營業利益", kind: "total", from: 0, to: p.operatingProfit, value: p.operatingProfit },
    { label: other >= 0 ? "＋ 其他收支" : "− 其他收支", kind: other >= 0 ? "plus" : "minus", from: p.operatingProfit, to: p.net, value: other },
    { label: "淨損益", kind: "total", from: 0, to: p.net, value: p.net },
  ];
  const all = steps.flatMap((s) => [s.from, s.to]);
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;
  const zero = pos(0);

  const rows = steps
    .map((s) => {
      const a = Math.min(s.from, s.to);
      const b = Math.max(s.from, s.to);
      const negTotal = (s.kind === "total" || s.kind === "key") && s.value < 0;
      const width = Math.max(0.4, pos(b) - pos(a));
      const share = p.revenue > 0 ? pct((Math.abs(s.value) / p.revenue) * 100) : "—";
      return `<div class="wf-row ${s.kind}">
<div class="wf-label">${esc(s.label)}</div>
<div class="wf-track">${lo < 0 ? `<span class="wf-zero" style="left:${zero.toFixed(2)}%"></span>` : ""}<span class="wf-bar ${s.kind}${negTotal ? " negative" : ""}" style="left:${pos(a).toFixed(2)}%;width:${width.toFixed(2)}%"></span></div>
<div class="wf-amt mono">${s.kind === "plus" || s.kind === "minus" ? signedMoney(s.value) : money(s.value)}</div>
<div class="wf-pct mono">${share}</div>
</div>`;
    })
    .join("");
  return `<section>${sectionTitle("一、損益結構", "從營業收入一路扣到淨損益，右欄為佔營業收入比例")}<div class="waterfall">${rows}</div></section>`;
}

function buildMonthlyChart(report: MonthlyFinanceReport, yearly: YearlyFinanceOverview): string {
  const W = 690;
  const H = 190;
  const top = 22;
  const bottom = 22;
  const plotH = H - top - bottom;
  const slot = W / 12;
  const barW = Math.min(30, slot * 0.56);
  const maxV = Math.max(1, ...yearly.months.map((m) => Math.max(m.revenue, m.directCost)));
  const scale = (v: number) => (v / maxV) * plotH;
  const baseY = top + plotH;

  const parts: string[] = [];
  parts.push(`<line x1="0" y1="${baseY}" x2="${W}" y2="${baseY}" stroke="#cbd5e1" stroke-width="1"/>`);
  for (const m of yearly.months) {
    const cx = slot * (m.month - 1) + slot / 2;
    const x = cx - barW / 2;
    const cur = m.month === report.month;
    const hasData = m.recordCount > 0 && (m.revenue > 0 || m.directCost > 0);
    if (hasData) {
      const costH = scale(m.directCost);
      const gpH = scale(Math.max(0, m.grossProfit));
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${(baseY - costH).toFixed(1)}" width="${barW.toFixed(1)}" height="${costH.toFixed(1)}" fill="${cur ? "#94a3b8" : "#cbd5e1"}"/>`
      );
      if (gpH > 0) {
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${(baseY - costH - gpH).toFixed(1)}" width="${barW.toFixed(1)}" height="${gpH.toFixed(1)}" rx="2" fill="${cur ? "#0f2a5c" : "#64748b"}"/>`
        );
      }
      const labelY = baseY - costH - gpH - 6;
      if (m.revenue > 0) {
        const margin = (m.grossProfit / m.revenue) * 100;
        parts.push(
          `<text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="${cur ? 700 : 400}" fill="${margin < 0 ? "#b91c1c" : cur ? "#ea580c" : "#9a3412"}">${Math.round(margin)}%</text>`
        );
      }
    }
    parts.push(
      `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" font-weight="${cur ? 700 : 400}" fill="${cur ? "#0f2a5c" : "#64748b"}">${m.month}月</text>`
    );
  }

  const withRevenue = yearly.months.filter((m) => m.revenue > 0);
  const ytdRevenue = yearly.total.revenue;
  const ytdMargin = ytdRevenue > 0 ? (yearly.total.grossProfit / ytdRevenue) * 100 : null;
  const best = withRevenue.length > 0 ? withRevenue.reduce((a, b) => (b.grossProfit > a.grossProfit ? b : a)) : null;

  const legend = `<div class="legend"><span><i style="background:#0f2a5c"></i>毛利</span><span><i style="background:#cbd5e1"></i>直接成本</span><span><i class="txt">%</i>毛利率</span></div>`;
  const foot = `<div class="chart-foot">
<span>${yearly.year} 年累計毛利 <b class="mono">${money(yearly.total.grossProfit)}</b>${ytdMargin === null ? "" : `（毛利率 ${pct(ytdMargin)}）`}</span>
${best ? `<span>最高月份：${best.month} 月 <b class="mono">${money(best.grossProfit)}</b></span>` : ""}
<span>累計淨損益 <b class="mono ${yearly.total.net >= 0 ? "pos" : "neg"}">${money(yearly.total.net)}</b></span>
</div>`;

  return `<section><div class="sec-row">${sectionTitle(`二、${yearly.year} 年每月毛利`, "本月以深色標示")}${legend}</div>
<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="每月毛利長條圖">${parts.join("")}</svg>${foot}</section>`;
}

function buildEstimateAndCash(report: MonthlyFinanceReport, estimate: OperationsEstimate | null, cash: MonthEndCash): string {
  let estimateBody = `<p class="note">營運預估暫時無法取得。</p>`;
  if (estimate) {
    const revEst = estimate.estimatedRevenue;
    let warn = "";
    if (revEst !== null && revEst > 0) {
      const diff = estimate.actualRevenue - revEst;
      const rate = (diff / revEst) * 100;
      if (Math.abs(rate) >= 3) {
        warn =
          diff < 0
            ? `<div class="warn">記帳營收比預估少 ${money(-diff)}（${Math.abs(rate).toFixed(1)}%），請確認是否有款項未入帳。</div>`
            : `<div class="info">記帳營收比預估多 ${money(diff)}（${rate.toFixed(1)}%），可能含前期款項。</div>`;
      } else {
        warn = `<div class="ok">記帳營收與預估相符（差異 ${Math.abs(rate).toFixed(1)}%）。</div>`;
      }
    } else if (revEst === null) {
      warn = `<div class="info">本月尚未設定單價，無法預估營收。</div>`;
    }
    estimateBody = `<div class="est-grid">
<span></span><span class="th">預估</span><span class="th">記帳</span>
<span>營收</span><span class="mono r">${revEst === null ? "—" : money(revEst)}</span><span class="mono r">${money(estimate.actualRevenue)}</span>
<span>薪資</span><span class="mono r">${money(estimate.estimatedSalaryCost)}</span><span class="mono r">${money(estimate.actualSalaryCost)}</span>
</div>${warn}`;
  }

  const fundRows = cash.funds.length
    ? cash.funds
        .map((f) => `<div class="kv"><span>${esc(f.partyName)}餘額</span><span class="mono strong${f.balance < 0 ? " neg" : ""}">${money(f.balance)}</span></div>`)
        .join("")
    : `<div class="kv"><span>公款帳戶</span><span class="muted">未設定</span></div>`;

  return `<section class="two-col">
<div class="card"><h3>三、營運預估 vs 實際記帳</h3>${estimateBody}</div>
<div class="card"><h3>四、月底現金（${report.month} 月底）</h3>${fundRows}
<div class="kv"><span>公司累計淨額</span><span class="mono strong${cash.cumulativeNet < 0 ? " neg" : ""}">${money(cash.cumulativeNet)}</span></div>
<p class="note">累計淨額為開帳以來收入減支出；帳戶餘額為公款實際結存，兩者基礎不同。</p></div>
</section>`;
}

interface Highlight {
  name: string;
  kind: CategoryBreakdownRow["kind"];
  group: CategoryBreakdownRow["group"];
  amount: number;
  prevAmount: number;
  rate: number | null; // null＝上月沒有
}

// 本月重點變化：金額變動超過 ±8% 的分類（小額雜項不列），依變動金額排序
function computeHighlights(report: MonthlyFinanceReport): Highlight[] {
  const total = Math.max(report.summary.expenseTotal, report.summary.incomeTotal, 1);
  const minAmount = Math.max(500, total * 0.002);
  return report.categoryBreakdown
    .filter((r) => Math.max(r.amount, r.prevAmount) >= minAmount && r.amount !== r.prevAmount)
    .map((r) => ({
      name: r.categoryName,
      kind: r.kind,
      group: r.group,
      amount: r.amount,
      prevAmount: r.prevAmount,
      rate: changeRate(r.amount, r.prevAmount),
    }))
    .filter((h) => h.rate === null || Math.abs(h.rate) >= 8)
    .sort((a, b) => Math.abs(b.amount - b.prevAmount) - Math.abs(a.amount - a.prevAmount))
    .slice(0, 6);
}

function buildExpenseDonut(report: MonthlyFinanceReport): string {
  const expenses = report.categoryBreakdown.filter((r) => r.kind === "EXPENSE" && r.amount > 0);
  const total = expenses.reduce((s, r) => s + r.amount, 0);
  if (total <= 0) {
    return `<section>${sectionTitle("五、支出結構")}<p class="empty">本月沒有支出帳目。</p></section>`;
  }
  const order = ["DIRECT_COST", "OPERATING_EXPENSE", "OTHER_EXPENSE"];
  const sorted = [...expenses].sort(
    (a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.amount - a.amount
  );
  // 圖例最多 11 列，其餘併為「其他」
  const MAX = 11;
  let slices: { name: string; group: string; amount: number; prevAmount: number; color: string }[] = [];
  const counters: Record<string, number> = {};
  for (const r of sorted) {
    const palette = PALETTES[r.group] ?? PALETTES.OTHER_EXPENSE;
    const i = counters[r.group] ?? 0;
    counters[r.group] = i + 1;
    slices.push({ name: r.categoryName, group: r.group, amount: r.amount, prevAmount: r.prevAmount, color: palette[Math.min(i, palette.length - 1)] });
  }
  if (slices.length > MAX) {
    const rest = slices.slice(MAX - 1);
    slices = slices.slice(0, MAX - 1);
    slices.push({
      name: `其他 ${rest.length} 項`,
      group: "OTHER_EXPENSE",
      amount: rest.reduce((s, r) => s + r.amount, 0),
      prevAmount: rest.reduce((s, r) => s + r.prevAmount, 0),
      color: "#e2e8f0",
    });
  }

  const R = 64;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const circles = slices
    .map((s) => {
      const len = (s.amount / total) * C;
      const gap = slices.length > 1 ? Math.min(1.2, len * 0.3) : 0;
      const el = `<circle cx="85" cy="85" r="${R}" fill="none" stroke="${s.color}" stroke-width="30" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${(C - len + gap).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 85 85)"/>`;
      offset += len;
      return el;
    })
    .join("");
  const directShare = (report.profit.directCost / total) * 100;
  const maxAmount = Math.max(...slices.map((s) => s.amount));

  const legend = slices
    .map((s) => {
      const rate = changeRate(s.amount, s.prevAmount);
      const delta =
        s.prevAmount === 0
          ? `<span class="delta new">新增</span>`
          : rate === null || Math.abs(rate) < 0.5
            ? `<span class="delta muted">—</span>`
            : `<span class="delta ${rate > 0 ? "up" : "down"}">${arrow(rate)}${Math.round(Math.abs(rate))}%</span>`;
      return `<div class="lg-row"><i style="background:${s.color}"></i><span class="lg-name">${esc(s.name)}</span><span class="lg-track"><span style="width:${Math.max(2, (s.amount / maxAmount) * 100).toFixed(1)}%;background:${s.color}"></span></span><span class="mono r">${money(s.amount)}</span><span class="mono r lg-share">${pct((s.amount / total) * 100)}</span>${delta}</div>`;
    })
    .join("");

  return `<section>${sectionTitle("五、支出結構", `合計 ${money(total)}・依損益歸屬分組`)}
<div class="donut-wrap">
<svg width="170" height="170" viewBox="0 0 170 170" role="img" aria-label="支出結構圓環圖">${circles}
<text x="85" y="80" text-anchor="middle" font-size="11" fill="#64748b">直接成本占</text>
<text x="85" y="101" text-anchor="middle" font-size="21" font-weight="700" fill="#0f2a5c">${pct(directShare)}</text></svg>
<div class="legend-list">${legend}
<p class="note">右側依序為金額、佔支出比例、較上月增減。暖色＝直接成本、藍色＝營業費用、灰色＝其他支出。</p></div>
</div></section>`;
}

function buildIncomeAndHighlights(report: MonthlyFinanceReport, highlights: Highlight[]): string {
  const incomes = report.categoryBreakdown.filter((r) => r.kind === "INCOME" && r.amount > 0);
  const incomeRows = incomes.length
    ? incomes
        .map((r) => `<div class="kv"><span>${esc(r.categoryName)}<span class="muted">（${esc(GROUP_LABELS[r.group] ?? "")}）</span></span><span class="mono">${money(r.amount)}</span></div>`)
        .join("")
    : `<p class="empty">本月沒有收入帳目。</p>`;

  const hlRows = highlights.length
    ? highlights
        .map((h) => {
          const up = h.amount > h.prevAmount;
          const good = h.kind === "INCOME" ? up : !up;
          const change = h.rate === null ? "上月無此項" : `較上月 ${up ? "+" : "−"}${Math.round(Math.abs(h.rate))}%`;
          return `<div class="hl"><span class="${good ? "pos" : "neg"}">${up ? "▲" : "▼"}</span> ${esc(h.name)} <span class="mono">${money(h.amount)}</span><span class="muted">（${change}，上月 ${money(h.prevAmount)}）</span></div>`;
        })
        .join("")
    : `<p class="empty">各分類與上月相比沒有明顯變化。</p>`;

  return `<section class="two-col">
<div class="card"><h3>六、收入來源</h3>${incomeRows}
<div class="kv total"><span>收入合計</span><span class="mono">${money(report.summary.incomeTotal)}</span></div></div>
<div class="card"><h3>七、本月重點變化</h3>${hlRows}<p class="note">自動列出較上月變動超過 ±8% 的分類。</p></div>
</section>`;
}

function buildSettlement(report: MonthlyFinanceReport): string {
  const cumulative = new Map(report.cumulativeSettlement.map((r) => [r.partyId, r]));
  const ids = [
    ...report.settlement.map((r) => r.partyId),
    ...report.cumulativeSettlement.map((r) => r.partyId).filter((id) => !report.settlement.some((s) => s.partyId === id)),
  ];
  const monthly = new Map(report.settlement.map((r) => [r.partyId, r]));
  if (ids.length === 0) {
    return `<section>${sectionTitle("八、股東結算")}<p class="empty">尚未設定股東。</p></section>`;
  }
  const rows = ids
    .map((id) => {
      const m = monthly.get(id);
      const c = cumulative.get(id);
      const name = m?.partyName ?? c?.partyName ?? "";
      const bal = (n: number) => `<span class="${n > 0 ? "" : n < 0 ? "neg" : "muted"}">${money(n)}</span>`;
      return `<tr><td>${esc(name)}</td><td class="mono r">${money(m?.advanced ?? 0)}</td><td class="mono r">${money(m?.received ?? 0)}</td><td class="mono r strong">${bal(m?.balance ?? 0)}</td><td class="mono r cum">${bal(c?.balance ?? 0)}</td></tr>`;
    })
    .join("");
  return `<section>${sectionTitle("八、股東結算")}
<table class="settle"><thead><tr><th>股東</th><th class="r">本月代墊</th><th class="r">本月領回</th><th class="r">本月結算</th><th class="r cum">開帳以來累計</th></tr></thead><tbody>${rows}</tbody></table>
<p class="note">結算＝代墊 − 領回；正數表示公司還欠該股東，負數表示股東已多領。</p></section>`;
}

function buildDetail(report: MonthlyFinanceReport): string {
  if (report.records.length === 0) {
    return `<p class="empty">本月沒有已核准的帳目。</p>`;
  }
  const groupOf = new Map(report.categoryBreakdown.map((r) => [`${r.kind}:${r.categoryName}`, r.group]));
  const byDate = new Map<string, typeof report.records>();
  for (const r of report.records) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }
  const body: string[] = [];
  for (const [date, rows] of byDate) {
    let inc = 0;
    let exp = 0;
    for (const r of rows) {
      if (r.type === "INCOME") inc += r.amount;
      else if (r.type === "EXPENSE") exp += r.amount;
    }
    const sub = [inc ? `<span class="pos">收 ${money(inc)}</span>` : "", exp ? `<span>支 ${money(exp)}</span>` : ""]
      .filter(Boolean)
      .join("　");
    body.push(`<tr class="day"><td colspan="4">${dayLabel(date)}<span class="day-count">${rows.length} 筆</span></td><td class="mono r day-sub">${sub}</td></tr>`);
    for (const r of rows) {
      let chip: string;
      let text: string;
      let party: string;
      let amount: string;
      let amountClass: string;
      if (r.type === "TRANSFER") {
        chip = `<span class="chip transfer">撥款</span>`;
        text = `${esc(r.partyName)} → ${esc(r.counterPartyName ?? "")}${r.note ? `<span class="muted">・${esc(r.note)}</span>` : ""}`;
        party = "—";
        amount = money(r.amount);
        amountClass = "transfer";
      } else {
        const group = groupOf.get(`${r.type}:${r.categoryName ?? "未分類"}`);
        const tone = r.type === "INCOME" ? "income" : group === "DIRECT_COST" ? "direct" : "opex";
        chip = `<span class="chip ${tone}">${esc(r.categoryName ?? "未分類")}</span>`;
        text = r.note ? esc(r.note) : `<span class="muted">—</span>`;
        party = esc(r.partyName);
        amount = r.type === "INCOME" ? `+${money(r.amount)}` : `-${money(r.amount)}`;
        amountClass = r.type === "INCOME" ? "pos" : "";
      }
      body.push(
        `<tr><td>${chip}</td><td class="txt">${text}</td><td class="party">${party}</td><td class="src">${esc(SOURCE_LABELS[r.sourceType] ?? r.sourceType)}</td><td class="mono r ${amountClass}">${amount}</td></tr>`
      );
    }
  }
  return `<table class="detail"><thead><tr><th style="width:92px">分類</th><th>內容</th><th style="width:88px">關係人</th><th style="width:72px">來源</th><th class="r" style="width:96px">金額</th></tr></thead><tbody>${body.join("")}</tbody></table>`;
}

// ─── 版面 ────────────────────────────────────────────────────────────────────

const STYLE = `
:root{--navy:#0f2a5c;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--soft:#f1f5fb;--pos:#15803d;--neg:#b91c1c}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#e5e7eb;color:var(--ink);font-family:"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif;font-size:12px;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.mono{font-family:"IBM Plex Mono","Consolas",monospace;font-variant-numeric:tabular-nums}
.serif,h1,h2,h3{font-family:"Noto Serif TC","PMingLiU",serif}
.pos{color:var(--pos)}.neg{color:var(--neg)}.muted{color:var(--muted)}.strong{font-weight:600}.r{text-align:right}
.toolbar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--navy);color:#fff}
.toolbar .t{font-size:13px}
.toolbar .btns{display:flex;gap:8px}
.toolbar button,.toolbar a{font:inherit;font-size:13px;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;text-decoration:none}
.toolbar .primary{background:#fff;color:var(--navy);font-weight:600}
.toolbar .ghost{background:rgba(255,255,255,.14);color:#fff}
.sheet{width:794px;max-width:calc(100% - 32px);min-height:1123px;margin:20px auto;background:#fff;padding:44px 52px 36px;box-shadow:0 2px 12px rgba(15,23,42,.12);display:flex;flex-direction:column;gap:20px}
.sheet.flow{min-height:0}
header.masthead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:3px solid var(--navy);padding-bottom:14px}
.masthead .co{font-size:12px;letter-spacing:3px;color:#475569}
.masthead h1{margin:4px 0 0;font-size:30px;color:var(--navy)}
.masthead .meta{text-align:right;font-size:11px;color:var(--muted);line-height:1.7}
header.running{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #cbd5e1;padding-bottom:8px}
header.running b{font-family:"Noto Serif TC",serif;font-size:16px;color:var(--navy)}
header.running span{font-size:11px;color:var(--muted)}
.conclusion{display:block;background:var(--soft);border-left:4px solid var(--navy);border-radius:6px;padding:12px 16px;font-size:13px;line-height:1.85;color:#1e293b}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.kpi{border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:3px}
.kpi.dark{background:var(--navy);border-color:var(--navy)}
.kpi-label{font-size:11px;color:var(--muted)}.kpi.dark .kpi-label,.kpi.dark .kpi-sub{color:#c7d2fe}
.kpi-value{font-size:20px;font-weight:600}.kpi.dark .kpi-value{color:#fff}
.kpi-sub{font-size:10.5px}
section{display:flex;flex-direction:column;gap:8px;break-inside:avoid}
.sec-title{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.sec-title h2{margin:0;font-size:16px;color:var(--navy)}
.sec-title .hint{font-size:11px;color:var(--muted)}
.sec-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
.legend{display:flex;gap:12px;font-size:10px;color:#475569}
.legend i{display:inline-block;width:9px;height:9px;margin-right:4px;vertical-align:-1px}
.legend i.txt{width:auto;height:auto;font-style:normal;color:#ea580c;font-weight:700}
.waterfall{display:flex;flex-direction:column;gap:6px}
.wf-row{display:grid;grid-template-columns:96px minmax(0,1fr) 104px 52px;gap:10px;align-items:center}
.wf-label{font-size:12px}
.wf-row.total .wf-label,.wf-row.total .wf-amt{font-weight:600}
.wf-row.key .wf-label,.wf-row.key .wf-amt{font-weight:700;color:var(--navy)}
.wf-row.minus .wf-label,.wf-row.plus .wf-label{color:#475569;padding-left:8px}
.wf-row.minus .wf-amt,.wf-row.plus .wf-amt{color:#475569}
.wf-track{position:relative;height:16px;background:#f1f5f9;border-radius:3px}
.wf-bar{position:absolute;top:0;bottom:0;border-radius:3px}
.wf-bar.total{background:#64748b}.wf-bar.key{background:var(--navy)}.wf-bar.minus{background:#f59e0b}.wf-bar.plus{background:#16a34a}.wf-bar.negative{background:var(--neg)}
.wf-zero{position:absolute;top:-3px;bottom:-3px;width:1px;background:#475569}
.wf-amt{font-size:12px;text-align:right}
.wf-pct{font-size:10px;color:var(--muted);text-align:right}
svg.chart{width:100%;height:auto;display:block}
.chart-foot{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:11px;color:#475569}
.two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.card{border:1px solid var(--line);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.card h3{margin:0 0 2px;font-size:14px;color:var(--navy)}
.est-grid{display:grid;grid-template-columns:1fr 84px 84px;gap:4px 8px;font-size:11.5px}
.est-grid .th{color:var(--muted);text-align:right}
.warn,.info,.ok{font-size:11px;border-radius:4px;padding:5px 8px}
.warn{color:#9a3412;background:#fff7ed}.info{color:#1e40af;background:#eff6ff}.ok{color:var(--pos);background:#f0fdf4}
.kv{display:flex;justify-content:space-between;gap:8px;font-size:12px}
.kv.total{border-top:1px solid var(--line);padding-top:6px;font-weight:600}
.note{margin:0;font-size:10.5px;color:var(--muted);line-height:1.6}
.empty{margin:0;font-size:12px;color:var(--muted)}
.donut-wrap{display:flex;gap:22px;align-items:center}
.donut-wrap svg{flex-shrink:0}
.legend-list{flex-grow:1;display:flex;flex-direction:column;gap:4px;min-width:0}
.lg-row{display:grid;grid-template-columns:10px 92px minmax(0,1fr) 78px 44px 44px;gap:8px;align-items:center;font-size:11.5px}
.lg-row i{width:10px;height:10px;border-radius:2px}
.lg-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lg-track{height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden}
.lg-track span{display:block;height:6px;border-radius:3px}
.lg-share{font-size:10.5px;color:var(--muted)}
.delta{font-size:10.5px;text-align:right;font-family:"IBM Plex Mono",monospace}
.delta.up{color:var(--neg)}.delta.down{color:var(--pos)}.delta.new{color:#1d4ed8;font-family:inherit}
.hl{font-size:11.5px;line-height:1.7;color:#334155}
.hl .muted{font-size:10.5px}
table{width:100%;border-collapse:collapse}
table.settle{font-size:12px}
table.settle th{background:var(--navy);color:#fff;font-weight:500;padding:7px 10px;text-align:left}
table.settle th.r{text-align:right}
table.settle th.cum{background:#1e3a8a}
table.settle td{padding:7px 10px;border-bottom:1px solid var(--line)}
table.settle td.cum{background:var(--soft);font-weight:600}
table.detail{font-size:11px}
table.detail thead th{border-bottom:2px solid var(--navy);color:#475569;font-weight:500;padding:5px 6px;text-align:left}
table.detail thead th.r{text-align:right}
table.detail td{padding:5px 6px;border-bottom:1px solid #eef2f7;vertical-align:top}
table.detail tr{break-inside:avoid}
table.detail tr.day td{background:var(--soft);font-weight:700;color:var(--navy);border-bottom:0;padding-top:6px}
table.detail tr.day .day-count{font-weight:400;color:var(--muted);font-size:10px;margin-left:8px}
table.detail td.day-sub{font-weight:400;font-size:10px;color:#475569;white-space:nowrap}
table.detail td.txt{word-break:break-word}
table.detail td.party{color:#475569}
table.detail td.src{color:var(--muted);font-size:10px}
table.detail td.transfer{color:#1d4ed8}
.chip{display:inline-block;border-radius:4px;padding:1px 6px;font-size:10.5px;white-space:nowrap}
.chip.direct{background:#ffedd5;color:#9a3412}.chip.opex{background:#e2e8f0;color:#334155}.chip.income{background:#dcfce7;color:#166534}.chip.transfer{background:#dbeafe;color:#1e40af}
.sheet-foot{margin-top:auto;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;border-top:1px solid var(--line);padding-top:8px}
@page{size:A4;margin:12mm 12mm 14mm;@bottom-left{content:"${COMPANY}・帳務月報";font-size:8pt;color:#94a3b8}@bottom-right{content:"第 " counter(page) " 頁 / 共 " counter(pages) " 頁";font-size:8pt;color:#94a3b8}}
@media print{
  body{background:#fff}
  .toolbar,.sheet-foot{display:none}
  .sheet{width:auto;max-width:none;min-height:0;margin:0;padding:0;box-shadow:none;break-after:page;gap:18px}
  .sheet:last-child{break-after:auto}
}
@media screen and (max-width:720px){
  .sheet{padding:24px 16px;min-height:0;gap:16px;max-width:calc(100% - 16px);margin:8px auto}
  header.masthead{flex-direction:column;align-items:flex-start}
  .masthead .meta{text-align:left}
  .masthead h1{font-size:24px}
  .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .two-col{grid-template-columns:1fr}
  .donut-wrap{flex-direction:column;align-items:stretch}
  .donut-wrap svg{align-self:center}
  .lg-row{grid-template-columns:10px 72px minmax(0,1fr) 70px 40px;}
  .lg-row .lg-share{display:none}
  .wf-row{grid-template-columns:74px minmax(0,1fr) 88px;}
  .wf-pct{display:none}
  .detail-scroll{overflow-x:auto}
  table.detail{min-width:560px}
}
`;

export function renderFinanceReportHtml(data: FinanceHtmlReportData): string {
  const { report, estimate, yearly, cash, generatedAt } = data;
  const y = report.year;
  const m = report.month;
  const mm = String(m).padStart(2, "0");
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const title = `${y} 年 ${m} 月 帳務月報`;
  const highlights = computeHighlights(report);
  const filename = `帳務月報_${y}_${mm}.html`;
  const footer = (label: string) =>
    `<div class="sheet-foot"><span>${COMPANY}・帳務月報 ${y}/${mm}</span><span>${esc(label)}</span></div>`;

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}・${COMPANY}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
<div class="toolbar">
<span class="t">${esc(title)}</span>
<span class="btns"><button type="button" class="primary" onclick="window.print()">列印／另存 PDF</button><a class="ghost" id="save-html" download="${esc(filename)}">下載 HTML</a></span>
</div>

<div class="sheet">
<header class="masthead">
<div><div class="co">${COMPANY}</div><h1>${esc(title)}</h1></div>
<div class="meta"><div>統計期間 ${y}/${mm}/01 – ${mm}/${lastDay}</div><div>僅計入已核准帳目・產出 ${taipeiDate(generatedAt)}</div></div>
</header>
${buildConclusion(report, highlights)}
${buildKpis(report)}
${buildWaterfall(report)}
${buildMonthlyChart(report, yearly)}
${buildEstimateAndCash(report, estimate, cash)}
${footer("經營摘要")}
</div>

<div class="sheet">
<header class="running"><b>${esc(title)}</b><span>收支結構與股東結算</span></header>
${buildExpenseDonut(report)}
${buildIncomeAndHighlights(report, highlights)}
${buildSettlement(report)}
${footer("收支結構")}
</div>

<div class="sheet flow">
<header class="running"><b>${esc(title)}</b><span>附錄・帳務明細（${report.records.length} 筆）</span></header>
${sectionTitle("九、帳務明細", "依日期排列・每日附收支小計・內部撥款不計入損益")}
<div class="detail-scroll">${buildDetail(report)}</div>
${footer("帳務明細")}
</div>
<script>
(function(){var a=document.getElementById("save-html");if(!a)return;
var html="<!doctype html>\\n"+document.documentElement.outerHTML;
try{a.href=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));}catch(e){a.style.display="none";}})();
</script>
</body>
</html>`;
}
