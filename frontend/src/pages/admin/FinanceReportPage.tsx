import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clock, FileDown, FileSpreadsheet, FileText, PieChart, Wallet } from "lucide-react";
import { apiClient, downloadFile, getErrorMessage } from "../../api/client";
import { YearMonthPicker } from "../../components/YearMonthPicker";
import type {
  FinanceAllTimeOverview,
  FinanceCategoryBreakdownRow,
  FinanceCategoryGroup,
  FinanceCategorySummaryRow,
  FinanceGroupedProfit,
  FinanceOperationsEstimate,
  FinanceSettlementRow,
  MonthlyFinanceReport,
  YearlyFinanceOverview, FinanceAssetSummary } from "../../api/types";

function fmt(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return `NT$ ${sign}${Math.abs(rounded).toLocaleString()}`;
}

// ─── 圓餅圖（沿用 dataviz 參考色盤，超過 8 類合併為「其他類別」） ────────────────

const CHART_COLORS = [
  "#2a78d6", "#1baf7a", "#eda100", "#008300",
  "#4a3aa7", "#e34948", "#e87ba4", "#eb6834",
];
const FOLD_COLOR = "#898781";

interface DonutSlice {
  name: string;
  amount: number;
  percent: number;
  color: string;
}

function buildSlices(rows: FinanceCategorySummaryRow[]): DonutSlice[] {
  const slices: DonutSlice[] = rows.slice(0, 8).map((r, i) => ({
    name: r.categoryName,
    amount: r.amount,
    percent: r.percent,
    color: CHART_COLORS[i],
  }));
  const rest = rows.slice(8);
  if (rest.length > 0) {
    slices.push({
      name: "其他類別",
      amount: rest.reduce((s, r) => s + r.amount, 0),
      percent: rest.reduce((s, r) => s + r.percent, 0),
      color: FOLD_COLOR,
    });
  }
  return slices;
}

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(
  cx: number, cy: number, outerR: number, innerR: number,
  startAngle: number, endAngle: number
): string {
  const clamped = Math.min(endAngle, startAngle + 359.99);
  const largeArc = clamped - startAngle > 180 ? 1 : 0;
  const oStart = polar(cx, cy, outerR, startAngle);
  const oEnd = polar(cx, cy, outerR, clamped);
  const iStart = polar(cx, cy, innerR, clamped);
  const iEnd = polar(cx, cy, innerR, startAngle);
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${oEnd.x} ${oEnd.y}`,
    `L ${iStart.x} ${iStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${iEnd.x} ${iEnd.y}`,
    "Z",
  ].join(" ");
}

function DonutChart({ slices }: { slices: DonutSlice[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const size = 180;
  const cx = size / 2;
  const total = slices.reduce((s, x) => s + x.amount, 0);
  if (total <= 0) return null;

  let angle = 0;
  const paths = slices.map((s, i) => {
    const sweep = (s.amount / total) * 360;
    const d = slicePath(cx, cx, 84, 44, angle, angle + sweep);
    angle += sweep;
    return (
      <path
        key={i}
        d={d}
        fill={s.color}
        stroke="#ffffff"
        strokeWidth={2}
        opacity={hovered === null || hovered === i ? 1 : 0.35}
        onMouseEnter={() => setHovered(i)}
        onMouseLeave={() => setHovered(null)}
      >
        <title>{`${s.name}：${fmt(s.amount)}（${s.percent.toFixed(1)}%）`}</title>
      </path>
    );
  });

  const active = hovered !== null ? slices[hovered] : null;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
          {paths}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {active ? (
            <>
              <span className="max-w-[80px] truncate text-xs text-gray-500">{active.name}</span>
              <span className="text-sm font-semibold text-gray-800">{active.percent.toFixed(1)}%</span>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-400">合計</span>
              <span className="text-sm font-semibold text-gray-800">{fmt(total)}</span>
            </>
          )}
        </div>
      </div>
      <ul className="space-y-1">
        {slices.map((s, i) => (
          <li
            key={i}
            className="flex cursor-default items-center gap-2 text-sm"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-gray-700">{s.name}</span>
            <span className="text-gray-400">{s.percent.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── 區塊元件 ────────────────────────────────────────────────────────────────

function CategorySection({ title, rows }: { title: string; rows: FinanceCategorySummaryRow[] }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">本月無資料</p>
      ) : (
        <div className="space-y-4">
          <DonutChart slices={buildSlices(rows)} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-3 py-2 text-left">分類</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2 text-right">佔比</th>
                  <th className="px-3 py-2 text-right">筆數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.categoryId ?? r.categoryName}>
                    <td className="px-3 py-2 text-gray-700">{r.categoryName}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-800">{fmt(r.amount)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{r.percent.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right text-gray-500">{r.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 text-sm font-semibold">
                  <td className="px-3 py-2 text-gray-600">合計</td>
                  <td className="px-3 py-2 text-right text-gray-800">{fmt(total)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">100%</td>
                  <td className="px-3 py-2 text-right text-gray-600">{totalCount}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 總覽（所有時期） ─────────────────────────────────────────────────────────

function OverviewTab() {
  const [data, setData] = useState<FinanceAllTimeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<FinanceAllTimeOverview>("/finance/report/overview")
      .then(({ data }) => setData(data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-sm text-gray-400">載入中...</p>;

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        統計期間：{data.firstDate ?? "-"} ～ {data.lastDate ?? "-"}（共 {data.recordCount} 筆帳目）
      </p>

      {/* 全期間損益 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">收入合計（所有時期）</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{fmt(data.summary.incomeTotal)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">支出合計（所有時期）</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{fmt(data.summary.expenseTotal)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">淨損益（排除內部撥款）</p>
          <p className={`mt-1 text-2xl font-bold ${data.summary.net < 0 ? "text-red-700" : "text-green-700"}`}>
            {fmt(data.summary.net)}
          </p>
        </div>
      </div>

      {/* 各股東所有時期結算 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-gray-700">股東結算（所有時期）</h3>
        <p className="mb-3 text-xs text-gray-400">
          代墊支出＝名下支出＋撥給他人；領回金額＝收到撥款＋名下收入；剩餘結算＝代墊 − 領回（正數表示公司還欠該股東）。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="px-3 py-2 text-left">股東</th>
                <th className="px-3 py-2 text-right">代墊支出</th>
                <th className="px-3 py-2 text-right">領回金額</th>
                <th className="px-3 py-2 text-right">剩餘結算</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.settlement.map((r) => (
                <tr key={r.partyId}>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.partyName}</td>
                  <td className="px-3 py-2 text-right text-gray-800">{fmt(r.advanced)}</td>
                  <td className="px-3 py-2 text-right text-gray-800">{fmt(r.received)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${
                    r.balance < 0 ? "text-red-600" : "text-gray-800"
                  }`}>
                    {fmt(r.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 公款餘額（所有時期） */}
      {data.funds.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-gray-700">公款餘額（所有時期）</h3>
          <p className="mb-3 text-xs text-gray-400">
            不參與股東結算的關係人（如「旭寺公款」）：餘額＝名下收入＋收到撥款 − 名下支出 − 撥出，代表帳戶裡實際還有多少現金。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-3 py-2 text-left">帳戶</th>
                  <th className="px-3 py-2 text-right">現金餘額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.funds.map((f) => (
                  <tr key={f.partyId}>
                    <td className="px-3 py-2 font-medium text-gray-800">{f.partyName}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      f.balance < 0 ? "text-red-600" : "text-gray-800"
                    }`}>
                      {fmt(f.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 所有時期分類彙總 */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <CategorySection title="支出類別彙總（所有時期）" rows={data.expenseByCategory} />
        <CategorySection title="收入來源彙總（所有時期）" rows={data.incomeByCategory} />
      </div>
    </div>
  );
}

// ─── 毛利相關共用 ────────────────────────────────────────────────────────────

function money(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? "-" : ""}$${Math.abs(r).toLocaleString()}`;
}

function marginText(part: number, base: number): string {
  return base > 0 ? `${((part / base) * 100).toFixed(1)}%` : "-";
}

// 較上月變化（金額與百分比），上月為 0 時只顯示金額
function Delta({ cur, prev, invert, asPoints }: { cur: number; prev: number; invert?: boolean; asPoints?: boolean }) {
  const diff = cur - prev;
  if (Math.round(diff * 10) === 0) return <span className="text-gray-400">持平</span>;
  const good = invert ? diff < 0 : diff > 0;
  const text = asPoints
    ? `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)} 個百分點`
    : `${diff > 0 ? "▲" : "▼"} ${money(Math.abs(diff))}${prev !== 0 ? `（${diff > 0 ? "+" : "-"}${Math.abs((diff / Math.abs(prev)) * 100).toFixed(1)}%）` : ""}`;
  return <span className={`font-mono ${good ? "text-green-700" : "text-red-700"}`}>{text}</span>;
}

// 損益結構：營業收入 → 毛利 → 營業利益 → 淨損益 的瀑布圖
function ProfitWaterfall({ p }: { p: FinanceGroupedProfit }) {
  const otherNet = p.otherIncome - p.otherExpense;
  type Step = { label: string; kind: "total" | "key" | "minus" | "plus"; from: number; to: number; amount: number };
  const steps: Step[] = [
    { label: "營業收入", kind: "total", from: 0, to: p.revenue, amount: p.revenue },
    { label: "− 直接成本", kind: "minus", from: p.grossProfit, to: p.revenue, amount: -p.directCost },
    { label: "毛利", kind: "key", from: 0, to: p.grossProfit, amount: p.grossProfit },
    { label: "− 營業費用", kind: "minus", from: p.operatingProfit, to: p.grossProfit, amount: -p.operatingExpense },
    { label: "營業利益", kind: "total", from: 0, to: p.operatingProfit, amount: p.operatingProfit },
    {
      label: "± 其他收支",
      kind: otherNet >= 0 ? "plus" : "minus",
      from: p.operatingProfit,
      to: p.net,
      amount: otherNet,
    },
    { label: "淨損益", kind: "total", from: 0, to: p.net, amount: p.net },
  ];
  // 座標範圍涵蓋負值（虧損時毛利或淨損益可能為負）
  const lo = Math.min(0, ...steps.flatMap((s) => [s.from, s.to]));
  const hi = Math.max(1, ...steps.flatMap((s) => [s.from, s.to]));
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const color = { total: "bg-slate-500", key: "bg-blue-700", minus: "bg-amber-500", plus: "bg-green-600" };

  return (
    <div className="space-y-2">
      {steps.map((s) => {
        const a = Math.min(s.from, s.to);
        const b = Math.max(s.from, s.to);
        const negTotal = s.kind !== "minus" && s.kind !== "plus" && s.amount < 0;
        return (
          <div key={s.label} className="grid grid-cols-[88px_minmax(0,1fr)_104px] items-center gap-3 sm:grid-cols-[110px_minmax(0,1fr)_120px_56px]">
            <div
              className={`text-sm ${
                s.kind === "key" ? "font-bold text-blue-700" : s.kind === "total" ? "font-semibold text-gray-800" : "pl-2 text-gray-600"
              }`}
            >
              {s.label}
            </div>
            <div className="relative h-5 rounded bg-gray-50">
              {lo < 0 && <div className="absolute inset-y-0 w-px bg-gray-300" style={{ left: `${pos(0)}%` }} />}
              <div
                className={`absolute inset-y-0 rounded ${negTotal ? "bg-red-600" : color[s.kind]}`}
                style={{ left: `${pos(a)}%`, width: `${Math.max(0.4, pos(b) - pos(a))}%` }}
              />
            </div>
            <div
              className={`text-right font-mono text-sm ${
                s.kind === "key" ? "font-bold text-blue-700" : s.kind === "total" ? "font-semibold" : "text-gray-600"
              } ${s.amount < 0 && s.kind !== "minus" ? "text-red-700" : ""}`}
            >
              {s.kind === "plus" && s.amount > 0 ? "+" : ""}
              {money(s.amount)}
            </div>
            <div className="hidden text-right font-mono text-xs text-gray-500 sm:block">
              {marginText(Math.abs(s.amount), p.revenue)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EstimateCard({ estimate }: { estimate: FinanceOperationsEstimate | null }) {
  if (!estimate) return null;
  const { estimatedRevenue, estimatedSalaryCost, actualRevenue, actualSalaryCost } = estimate;
  if (estimatedRevenue === null && estimatedSalaryCost === 0) {
    return (
      <section className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
        <h2 className="mb-1 font-semibold text-gray-700">營運預估 vs 實際記帳</h2>
        本月沒有送件／薪資資料或尚未設定單價，無法與記帳對照。
      </section>
    );
  }
  const estGap = estimatedRevenue !== null ? estimatedRevenue - estimatedSalaryCost : null;
  const actGap = actualRevenue - actualSalaryCost;
  const revDiff = estimatedRevenue !== null ? estimatedRevenue - actualRevenue : 0;
  const warn = estimatedRevenue !== null && estimatedRevenue > 0 && Math.abs(revDiff) / estimatedRevenue >= 0.03;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-800">營運預估 vs 實際記帳</h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        營運預估＝每日營運總表（件數 × 單價、薪資試算）。只比營收與薪資，用來抓漏記的帳。
      </p>
      <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2 text-sm">
        <span />
        <span className="text-right text-xs text-gray-500">營運預估</span>
        <span className="text-right text-xs text-gray-500">實際記帳</span>
        <span>營收</span>
        <span className="text-right font-mono">{estimatedRevenue !== null ? money(estimatedRevenue) : "未設單價"}</span>
        <span className="text-right font-mono">{money(actualRevenue)}</span>
        <span>薪資成本</span>
        <span className="text-right font-mono">{money(estimatedSalaryCost)}</span>
        <span className="text-right font-mono">{money(actualSalaryCost)}</span>
        <span className="border-t border-gray-100 pt-2 font-semibold">營收 − 薪資</span>
        <span className="border-t border-gray-100 pt-2 text-right font-mono font-semibold">
          {estGap !== null ? money(estGap) : "-"}
        </span>
        <span className="border-t border-gray-100 pt-2 text-right font-mono font-semibold">{money(actGap)}</span>
      </div>
      {warn && (
        <p className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-relaxed text-orange-800">
          記帳營收比營運預估{revDiff > 0 ? "少" : "多"}{" "}
          <span className="font-mono font-semibold">{money(Math.abs(revDiff))}</span>
          （{((Math.abs(revDiff) / estimatedRevenue!) * 100).toFixed(1)}%）。
          {revDiff > 0 ? "可能有貨運行款項尚未入帳，或單價設定需更新。" : "可能有其他月份的款項記在本月。"}
        </p>
      )}
    </section>
  );
}

const GROUP_SECTIONS: { title: string; groups: FinanceCategoryGroup[]; bar: string; invert: boolean }[] = [
  { title: "營業收入・其他收入", groups: ["REVENUE", "OTHER_INCOME"], bar: "bg-slate-500", invert: false },
  { title: "直接成本", groups: ["DIRECT_COST"], bar: "bg-amber-500", invert: true },
  { title: "營業費用・其他支出", groups: ["OPERATING_EXPENSE", "OTHER_EXPENSE"], bar: "bg-slate-400", invert: true },
];

function GroupTable({
  title,
  rows,
  bar,
  invert,
}: {
  title: string;
  rows: FinanceCategoryBreakdownRow[];
  bar: string;
  invert: boolean;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <span className={`h-2.5 w-2.5 rounded-sm ${bar}`} />
          {title}
        </h3>
        <span className="font-mono text-sm font-semibold">{money(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-gray-400">本月無資料</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] text-gray-500">
              <th className="pb-1.5 text-left font-normal">分類</th>
              <th className="pb-1.5 text-right font-normal">金額</th>
              <th className="pb-1.5 text-right font-normal">較上月</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.prevAmount > 0 ? Math.round(((r.amount - r.prevAmount) / r.prevAmount) * 100) : null;
              const up = r.amount > r.prevAmount;
              const good = invert ? !up : up;
              return (
                <tr key={`${r.kind}:${r.categoryId}`}>
                  <td className="py-1.5 pr-2">
                    <div className={r.amount === 0 ? "text-gray-400" : "text-gray-800"}>
                      {r.categoryName}
                      {(r.group === "OTHER_INCOME" || r.group === "OTHER_EXPENSE") && (
                        <span className="ml-1 text-[11px] text-gray-400">其他</span>
                      )}
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-gray-100">
                      <div className={`h-1 rounded-full ${bar}`} style={{ width: `${(r.amount / max) * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-1.5 text-right font-mono">{money(r.amount)}</td>
                  <td
                    className={`py-1.5 pl-2 text-right font-mono text-xs ${
                      r.amount === r.prevAmount ? "text-gray-400" : good ? "text-green-700" : "text-red-700"
                    }`}
                    title={`上月 ${money(r.prevAmount)}`}
                  >
                    {r.amount === r.prevAmount ? "—" : pct === null ? "新" : `${up ? "▲" : "▼"}${Math.abs(pct)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ─── 年度總覽 ────────────────────────────────────────────────────────────────

function YearlyTab({ year, onYearChange }: { year: number; onYearChange: (y: number) => void }) {
  const [data, setData] = useState<YearlyFinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<YearlyFinanceOverview>("/finance/report/yearly", { params: { year } })
      .then(({ data }) => setData(data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [year]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 self-start rounded-md border border-gray-300 bg-white p-0.5 shadow-sm w-fit">
        <button
          type="button"
          onClick={() => onYearChange(year - 1)}
          aria-label="上一年"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-1 font-mono text-sm font-semibold text-gray-800">{year}</span>
        <button
          type="button"
          onClick={() => onYearChange(year + 1)}
          aria-label="下一年"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading || !data ? (
        <p className="text-sm text-gray-400">載入中...</p>
      ) : (
        <YearlyContent data={data} />
      )}
    </div>
  );
}

function YearlyContent({ data }: { data: YearlyFinanceOverview }) {
  const withRevenue = data.months.filter((m) => m.revenue > 0);
  const margins = withRevenue.map((m) => ({ month: m.month, v: (m.grossProfit / m.revenue) * 100 }));
  const best = margins.reduce<typeof margins[number] | null>((a, b) => (!a || b.v > a.v ? b : a), null);
  const worst = margins.reduce<typeof margins[number] | null>((a, b) => (!a || b.v < a.v ? b : a), null);
  const t = data.total;

  const barH = 180;
  const maxRev = Math.max(1, ...data.months.map((m) => Math.max(m.revenue, m.directCost)));
  const mLo = Math.min(0, ...margins.map((m) => m.v));
  const mHi = Math.max(10, ...margins.map((m) => m.v));
  const lineY = (v: number) => barH - ((v - mLo) / (mHi - mLo || 1)) * (barH - 16) - 8;
  const points = margins.map((m) => `${((m.month - 0.5) / 12) * 1000},${lineY(m.v).toFixed(1)}`).join(" ");

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="年度營業收入" value={money(t.revenue)} />
        <div className="rounded-xl bg-blue-700 px-4 py-3 text-white shadow-sm">
          <div className="text-xs text-blue-100">年度毛利</div>
          <div className="mt-1 font-mono text-2xl font-semibold">{money(t.grossProfit)}</div>
          <div className="mt-0.5 text-xs text-blue-100">
            平均毛利率 <span className="font-mono">{marginText(t.grossProfit, t.revenue)}</span>
          </div>
        </div>
        <Kpi label="年度淨損益" value={money(t.net)} tone={t.net < 0 ? "neg" : "pos"} />
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs text-gray-500">毛利率最高 / 最低</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">
            {best ? `${best.month} 月` : "-"} <span className="font-normal text-gray-400">/</span>{" "}
            {worst ? `${worst.month} 月` : "-"}
          </div>
          <div className="mt-0.5 font-mono text-xs text-gray-500">
            {best ? `${best.v.toFixed(1)}%` : "-"} / {worst ? `${worst.v.toFixed(1)}%` : "-"}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-800">每月毛利與毛利率</h2>
          <div className="flex gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-700" />毛利</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />直接成本</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-orange-600" />毛利率</span>
          </div>
        </div>
        <div className="relative" style={{ height: barH }}>
          <div className="absolute inset-0 flex items-end gap-1.5 border-b border-gray-200 sm:gap-4">
            {data.months.map((m) => {
              const gp = Math.max(0, m.grossProfit);
              const cost = Math.min(m.directCost, m.revenue || m.directCost);
              return (
                <div
                  key={m.month}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  title={
                    m.recordCount > 0
                      ? `${m.month}月：營收 ${money(m.revenue)}／直接成本 ${money(m.directCost)}／毛利 ${money(m.grossProfit)}（${marginText(m.grossProfit, m.revenue)}）`
                      : undefined
                  }
                >
                  <div className="w-full max-w-[44px] rounded-t bg-blue-700" style={{ height: (gp / maxRev) * (barH - 8) }} />
                  <div className="w-full max-w-[44px] bg-slate-300" style={{ height: (cost / maxRev) * (barH - 8) }} />
                </div>
              );
            })}
          </div>
          {margins.length > 1 && (
            <svg
              viewBox={`0 0 1000 ${barH}`}
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            >
              <polyline points={points} fill="none" stroke="#ea580c" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
        <div className="mt-1.5 flex gap-1.5 sm:gap-4">
          {data.months.map((m) => {
            const mg = margins.find((x) => x.month === m.month);
            return (
              <div key={m.month} className="min-w-0 flex-1 text-center">
                <div className="text-[11px] text-gray-500">{m.month}月</div>
                <div className="hidden font-mono text-[10px] text-orange-700 sm:block">{mg ? `${mg.v.toFixed(0)}%` : ""}</div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              <th className="px-3 py-2 text-left font-normal">月份</th>
              <th className="px-3 py-2 text-right font-normal">營業收入</th>
              <th className="px-3 py-2 text-right font-normal">直接成本</th>
              <th className="px-3 py-2 text-right font-semibold text-blue-700">毛利</th>
              <th className="px-3 py-2 text-right font-semibold text-blue-700">毛利率</th>
              <th className="px-3 py-2 text-right font-normal">營業費用</th>
              <th className="px-3 py-2 text-right font-normal">其他收支</th>
              <th className="px-3 py-2 text-right font-normal">淨損益</th>
              <th className="px-3 py-2 text-right font-normal">筆數</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.months.map((m) => {
              const empty = m.recordCount === 0;
              return (
                <tr key={m.month} className={empty ? "text-gray-300" : ""}>
                  <td className="px-3 py-2">{m.month} 月</td>
                  <td className="px-3 py-2 text-right font-mono">{empty ? "–" : money(m.revenue)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600">{empty ? "–" : money(m.directCost)}</td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${empty ? "" : m.grossProfit < 0 ? "text-red-700" : "text-blue-700"}`}>
                    {empty ? "–" : money(m.grossProfit)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{empty ? "–" : marginText(m.grossProfit, m.revenue)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600">{empty ? "–" : money(m.operatingExpense)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600">{empty ? "–" : money(m.otherIncome - m.otherExpense)}</td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${empty ? "" : m.net < 0 ? "text-red-700" : "text-green-700"}`}>
                    {empty ? "–" : money(m.net)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500">{m.recordCount}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
              <td className="px-3 py-2 text-gray-700">全年合計</td>
              <td className="px-3 py-2 text-right font-mono">{money(t.revenue)}</td>
              <td className="px-3 py-2 text-right font-mono">{money(t.directCost)}</td>
              <td className="px-3 py-2 text-right font-mono text-blue-700">{money(t.grossProfit)}</td>
              <td className="px-3 py-2 text-right font-mono">{marginText(t.grossProfit, t.revenue)}</td>
              <td className="px-3 py-2 text-right font-mono">{money(t.operatingExpense)}</td>
              <td className="px-3 py-2 text-right font-mono">{money(t.otherIncome - t.otherExpense)}</td>
              <td className={`px-3 py-2 text-right font-mono ${t.net < 0 ? "text-red-700" : "text-green-700"}`}>{money(t.net)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`mt-1 font-mono text-2xl font-semibold ${
          tone === "neg" ? "text-red-700" : tone === "pos" ? "text-green-700" : "text-gray-900"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

// ─── 目前現金（不分頁籤，隨時可見） ─────────────────────────────────────────────

function CashSummaryBar() {
  const [data, setData] = useState<FinanceAllTimeOverview | null>(null);

  useEffect(() => {
    apiClient
      .get<FinanceAllTimeOverview>("/finance/report/overview")
      .then(({ data }) => setData(data))
      .catch(() => setData(null));
  }, []);

  if (!data) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-7 gap-y-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3"
      title="公司累計淨額＝經營角度的整體損益；帳戶餘額＝該關係人名下實際收支＋撥款後的現金結存，兩者計算基礎不同，僅供互相對照。"
    >
      <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
        <Wallet className="h-4 w-4" />
        目前現金<span className="font-normal text-blue-700">（截至 {data.lastDate ?? "-"}）</span>
      </div>
      {data.funds.map((f) => (
        <div key={f.partyId} className="flex items-baseline gap-2">
          <span className="text-xs text-blue-700">{f.partyName}帳戶餘額</span>
          <span className={`font-mono text-lg font-semibold ${f.balance < 0 ? "text-red-700" : "text-blue-900"}`}>
            {money(f.balance)}
          </span>
        </div>
      ))}
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-blue-700">公司累計淨額</span>
        <span className={`font-mono text-lg font-semibold ${data.summary.net < 0 ? "text-red-700" : "text-blue-900"}`}>
          {money(data.summary.net)}
        </span>
      </div>
    </div>
  );
}

// ─── 資產與負債（月底）＋若用折舊計算的參考損益 ────────────────────────────────

function AssetSummarySection({ a }: { a: FinanceAssetSummary }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">資產與負債（月底）</h2>
        <Link to="/admin/assets" className="text-xs text-blue-600 hover:underline">
          前往資產 →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["資產總價", a.totalCost, `持有 ${a.count} 項`],
          ["帳面價值", a.bookValue, `累計折舊 ${money(a.totalCost - a.bookValue)}`],
          ["還欠分期", a.loanRemaining, "零利率，即剩餘本金"],
          ["淨資產", a.bookValue - a.loanRemaining, "帳面價值 − 還欠分期"],
        ].map(([label, v, sub]) => (
          <div key={label as string} className="rounded-lg bg-gray-50 px-3 py-2.5">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="font-mono text-lg font-semibold text-gray-900">{money(v as number)}</div>
            <div className="text-[11px] text-gray-400">{sub}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-600">
        <span className="font-medium text-gray-700">若用折舊計算（參考）：</span>
        本月淨損益 <span className="font-mono">{money(a.netProfit)}</span> ＋ 車貸 <span className="font-mono">{money(a.loanPaid)}</span>
        （零利率分期都是還本金，不算費用）－ 本月折舊 <span className="font-mono">{money(a.depreciation)}</span> ＝{" "}
        <span className={`font-mono font-semibold ${a.depreciationBasisNet < 0 ? "text-red-700" : "text-gray-900"}`}>
          {money(a.depreciationBasisNet)}
        </span>
        <p className="mt-1 text-[11px] text-gray-400">
          上方損益維持現金基礎（與股東結算、公款餘額一致）。頭期款或現金買車若記在其他分類，不在這個調整內。
        </p>
      </div>
    </section>
  );
}

// ─── 月報表 ──────────────────────────────────────────────────────────────────

function MonthlyContent({ report }: { report: MonthlyFinanceReport }) {
  const [settleView, setSettleView] = useState<"month" | "cumulative">("month");
  const p = report.profit;
  const prev = report.prevProfit;
  const gm = p.revenue > 0 ? (p.grossProfit / p.revenue) * 100 : 0;
  const prevGm = prev.revenue > 0 ? (prev.grossProfit / prev.revenue) * 100 : 0;
  const noRevenueGroup = p.revenue === 0 && report.summary.incomeTotal > 0;
  const recordsLink = `/admin/finance?year=${report.year}&month=${report.month}`;

  return (
    <div className="space-y-4">
      {report.pending.count > 0 && (
        <Link
          to="/admin/finance?status=PENDING"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 hover:bg-amber-100"
        >
          <Clock className="h-4 w-4" />
          本月有 <b>{report.pending.count}</b> 筆待審核帳目（<span className="font-mono">{money(report.pending.amount)}</span>）未計入報表
          <span className="ml-auto text-xs">前往審核 →</span>
        </Link>
      )}
      {noRevenueGroup && (
        <Link
          to="/admin/settings?tab=finance"
          className="block rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-800 hover:bg-orange-100"
        >
          本月收入都不是「營業收入」分類，毛利無法計算。請到帳務設定調整分類歸屬 →
        </Link>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="營業收入" value={money(p.revenue)} sub={<>較上月 <Delta cur={p.revenue} prev={prev.revenue} /></>} />
        <div className="rounded-xl bg-blue-700 px-4 py-3 text-white shadow-sm">
          <div className="flex justify-between text-xs text-blue-100">
            <span>毛利</span>
            <span>毛利率</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold">{money(p.grossProfit)}</span>
            <span className="font-mono text-xl font-semibold">{p.revenue > 0 ? `${gm.toFixed(1)}%` : "-"}</span>
          </div>
          <div className="mt-0.5 space-y-0.5 text-xs text-blue-100 [&_span]:!text-white">
            <div>
              較上月 <Delta cur={p.grossProfit} prev={prev.grossProfit} />
            </div>
            {p.revenue > 0 && prev.revenue > 0 && (
              <div>
                毛利率 <Delta cur={gm} prev={prevGm} asPoints />
              </div>
            )}
          </div>
        </div>
        <Kpi
          label="營業利益（毛利 − 營業費用）"
          value={money(p.operatingProfit)}
          tone={p.operatingProfit < 0 ? "neg" : undefined}
          sub={<>營業利益率 <span className="font-mono">{marginText(p.operatingProfit, p.revenue)}</span></>}
        />
        <Kpi
          label="本月淨損益（排除內部撥款）"
          value={money(report.summary.net)}
          tone={report.summary.net < 0 ? "neg" : "pos"}
          sub={<>較上月 <Delta cur={report.summary.net} prev={prev.net} /></>}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">損益結構</h2>
            <Link to="/admin/settings?tab=finance" className="text-xs text-blue-600 hover:underline">
              調整分類歸屬
            </Link>
          </div>
          <ProfitWaterfall p={p} />
        </section>
        <EstimateCard estimate={report.estimate} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {GROUP_SECTIONS.map((g) => (
          <GroupTable
            key={g.title}
            title={g.title}
            bar={g.bar}
            invert={g.invert}
            rows={report.categoryBreakdown.filter((r) => g.groups.includes(r.group))}
          />
        ))}
      </div>

      {report.assets && <AssetSummarySection a={report.assets} />}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">股東結算</h2>
            <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
              {(
                [
                  ["month", "本月"],
                  ["cumulative", "開帳以來累計"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSettleView(k)}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    settleView === k ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <SettlementRows rows={settleView === "month" ? report.settlement : report.cumulativeSettlement} />
        </section>
        <section className="flex flex-col justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">帳務明細</h2>
            <p className="mt-1 text-sm text-gray-600">
              本月 <span className="font-mono">{report.records.length}</span> 筆已核准
              {report.pending.count > 0 && (
                <span className="text-amber-800">・{report.pending.count} 筆待審核未計入</span>
              )}
            </p>
          </div>
          <Link
            to={recordsLink}
            className="rounded-lg border border-gray-300 px-3 py-2 text-center text-sm text-gray-800 hover:bg-gray-50"
          >
            在記帳頁查看本月明細 →
          </Link>
        </section>
      </div>
    </div>
  );
}

function SettlementRows({ rows }: { rows: FinanceSettlementRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400">尚無股東資料</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-[11px] text-gray-500">
            <th className="pb-1.5 text-left font-normal">股東</th>
            <th className="pb-1.5 text-right font-normal">代墊支出</th>
            <th className="pb-1.5 text-right font-normal">領回金額</th>
            <th className="pb-1.5 text-right font-normal">剩餘結算</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r) => (
            <tr key={r.partyId}>
              <td className="py-1.5 text-gray-800">{r.partyName}</td>
              <td className="py-1.5 text-right font-mono">{money(r.advanced)}</td>
              <td className="py-1.5 text-right font-mono">{money(r.received)}</td>
              <td className={`py-1.5 text-right font-mono font-semibold ${r.balance < 0 ? "text-red-700" : "text-gray-900"}`}>
                {money(r.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-gray-400">剩餘結算為正數表示公司還欠該股東。</p>
    </div>
  );
}

// ─── 主頁面 ──────────────────────────────────────────────────────────────────

export function FinanceReportPage() {
  const now = new Date();
  const [tab, setTab] = useState<"monthly" | "yearly" | "overview">("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [report, setReport] = useState<MonthlyFinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "excel" | "html" | null>(null);

  useEffect(() => {
    if (tab !== "monthly") return;
    setLoading(true);
    setError(null);
    apiClient
      .get<MonthlyFinanceReport>("/finance/report", { params: { year, month } })
      .then(({ data }) => setReport(data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [tab, year, month]);

  // HTML 報表：先同步開新分頁（避免被瀏覽器擋掉彈出視窗），取得內容後在新分頁顯示；被擋時改為下載
  async function handleOpenHtmlReport() {
    setDownloading("html");
    const monthStr = String(month).padStart(2, "0");
    const win = window.open("", "_blank");
    try {
      const { data } = await apiClient.get<Blob>("/finance/report/export-html", {
        params: { year, month },
        responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(
        new Blob([data], { type: "text/html;charset=utf-8" })
      );
      if (win) {
        win.location.href = blobUrl;
      } else {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `帳務月報_${year}_${monthStr}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      win?.close();
      setError(getErrorMessage(err));
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownload(kind: "pdf" | "excel") {
    setDownloading(kind);
    try {
      const monthStr = String(month).padStart(2, "0");
      if (kind === "pdf") {
        await downloadFile(
          `/finance/report/export-pdf?year=${year}&month=${month}`,
          `月報表_${year}_${monthStr}.pdf`
        );
      } else {
        await downloadFile(
          `/finance/report/export?year=${year}&month=${month}`,
          `月報表_${year}_${monthStr}.xlsx`
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDownloading(null);
    }
  }

  const tabs = [
    ["monthly", "月報表"],
    ["yearly", "年度總覽"],
    ["overview", "所有時期"],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <PieChart className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-800">帳務月報</h1>
            <p className="text-xs text-gray-500">僅計入已核准帳目</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {tabs.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  tab === k ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "monthly" && (
            <>
              <YearMonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
              <button
                type="button"
                onClick={() => handleDownload("excel")}
                disabled={downloading !== null}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {downloading === "excel" ? "匯出中..." : "Excel"}
              </button>
              <button
                type="button"
                onClick={() => handleDownload("pdf")}
                disabled={downloading !== null}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <FileDown className="h-4 w-4" />
                {downloading === "pdf" ? "匯出中..." : "PDF（對帳）"}
              </button>
              <button
                type="button"
                onClick={handleOpenHtmlReport}
                disabled={downloading !== null}
                title="開啟圖表版月報，可直接列印或另存 PDF"
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <FileText className="h-4 w-4" />
                {downloading === "html" ? "產生中..." : "圖表報表"}
              </button>
            </>
          )}
        </div>
      </div>

      <CashSummaryBar />

      {tab === "overview" ? (
        <OverviewTab />
      ) : tab === "yearly" ? (
        <YearlyTab year={year} onYearChange={setYear} />
      ) : (
        <>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {loading || !report ? <p className="text-sm text-gray-400">載入中...</p> : <MonthlyContent report={report} />}
        </>
      )}
    </div>
  );
}
