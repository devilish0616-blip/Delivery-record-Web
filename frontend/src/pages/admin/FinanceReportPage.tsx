import { useEffect, useState } from "react";
import { FileDown, FileSpreadsheet, PieChart, Wallet } from "lucide-react";
import { apiClient, downloadFile, getErrorMessage } from "../../api/client";
import type {
  FinanceAllTimeOverview,
  FinanceCategorySummaryRow,
  FinanceSettlementRow,
  MonthlyFinanceReport,
  YearlyFinanceOverview,
} from "../../api/types";

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

function SettlementTable({ title, rows }: { title: string; rows: FinanceSettlementRow[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">尚無股東資料</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              <th className="px-3 py-2 text-left">股東</th>
              <th className="px-3 py-2 text-right">代墊支出</th>
              <th className="px-3 py-2 text-right">領回金額</th>
              <th className="px-3 py-2 text-right">剩餘結算</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r) => (
              <tr key={r.partyId}>
                <td className="px-3 py-2 text-gray-700">{r.partyName}</td>
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
      )}
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  INCOME: "收入",
  EXPENSE: "支出",
  TRANSFER: "內部撥款",
};

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

// ─── 年度總覽 ────────────────────────────────────────────────────────────────

function YearlyTab() {
  const [year, setYear] = useState(new Date().getFullYear());
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

  const maxAmount = data
    ? Math.max(1, ...data.months.flatMap((m) => [m.incomeTotal, m.expenseTotal]))
    : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setYear(year - 1)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">‹</button>
        <span className="rounded border border-gray-200 bg-gray-50 px-4 py-1.5 text-sm font-medium text-gray-700">
          {year} 年
        </span>
        <button type="button" onClick={() => setYear(year + 1)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">›</button>
        {/* 圖例 */}
        <span className="ml-4 flex items-center gap-1.5 text-xs text-gray-500">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#2a78d6" }} />收入
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#eb6834" }} />支出
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading || !data ? (
        <p className="text-sm text-gray-400">載入中...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="px-3 py-2 text-left">月份</th>
                <th className="w-1/3 px-3 py-2 text-left">收支比較</th>
                <th className="px-3 py-2 text-right">收入</th>
                <th className="px-3 py-2 text-right">支出</th>
                <th className="px-3 py-2 text-right">淨損益</th>
                <th className="px-3 py-2 text-right">筆數</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.months.map((m) => (
                <tr key={m.month} className={m.recordCount === 0 ? "text-gray-300" : ""}>
                  <td className="px-3 py-2 text-gray-700">{m.month} 月</td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <div className="h-2 rounded-r bg-[#2a78d6]"
                        style={{ width: `${(m.incomeTotal / maxAmount) * 100}%` }}
                        title={`收入 ${fmt(m.incomeTotal)}`} />
                      <div className="h-2 rounded-r bg-[#eb6834]"
                        style={{ width: `${(m.expenseTotal / maxAmount) * 100}%` }}
                        title={`支出 ${fmt(m.expenseTotal)}`} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-800">{fmt(m.incomeTotal)}</td>
                  <td className="px-3 py-2 text-right text-gray-800">{fmt(m.expenseTotal)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${
                    m.net < 0 ? "text-red-600" : m.net > 0 ? "text-green-700" : "text-gray-500"
                  }`}>
                    {fmt(m.net)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">{m.recordCount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                <td className="px-3 py-2 text-gray-600" colSpan={2}>全年合計</td>
                <td className="px-3 py-2 text-right text-gray-800">{fmt(data.total.incomeTotal)}</td>
                <td className="px-3 py-2 text-right text-gray-800">{fmt(data.total.expenseTotal)}</td>
                <td className={`px-3 py-2 text-right ${data.total.net < 0 ? "text-red-600" : "text-green-700"}`}>
                  {fmt(data.total.net)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
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
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-blue-800">
        <Wallet className="h-4 w-4" />
        目前現金（截至 {data.lastDate ?? "-"}）
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <p className="text-xs text-blue-700">公司累計淨額（所有時期收入 − 支出，不含股東往來撥款）</p>
          <p className={`text-lg font-bold ${data.summary.net < 0 ? "text-red-700" : "text-blue-900"}`}>
            {fmt(data.summary.net)}
          </p>
        </div>
        {data.funds.map((f) => (
          <div key={f.partyId}>
            <p className="text-xs text-blue-700">{f.partyName}帳戶餘額</p>
            <p className={`text-lg font-bold ${f.balance < 0 ? "text-red-700" : "text-blue-900"}`}>
              {fmt(f.balance)}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-blue-600">
        公司累計淨額＝經營角度的整體損益；帳戶餘額＝該關係人名下實際收支＋撥款後的現金結存，兩者計算基礎不同，僅供互相對照。
      </p>
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
  const [downloading, setDownloading] = useState<"pdf" | "excel" | null>(null);

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

  function goToMonth(y: number, m: number) {
    if (m < 1) { setYear(y - 1); setMonth(12); }
    else if (m > 12) { setYear(y + 1); setMonth(1); }
    else { setYear(y); setMonth(m); }
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

  const tabClass = (t: typeof tab) =>
    `border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
      tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <PieChart className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold text-gray-800">帳務月報</h1>
      </div>

      <CashSummaryBar />

      <div className="flex gap-2 border-b border-gray-200">
        <button type="button" onClick={() => setTab("monthly")} className={tabClass("monthly")}>月報表</button>
        <button type="button" onClick={() => setTab("yearly")} className={tabClass("yearly")}>年度總覽</button>
        <button type="button" onClick={() => setTab("overview")} className={tabClass("overview")}>總覽（所有時期）</button>
      </div>

      {tab === "overview" ? (
        <OverviewTab />
      ) : tab === "yearly" ? (
        <YearlyTab />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              <button type="button" onClick={() => goToMonth(year, month - 1)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">‹</button>
              <span className="flex items-center rounded border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-700">
                {year} 年 {month} 月
              </span>
              <button type="button" onClick={() => goToMonth(year, month + 1)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">›</button>
            </div>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => handleDownload("excel")}
                disabled={downloading !== null}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {downloading === "excel" ? "匯出中..." : "匯出 Excel"}
              </button>
              <button
                type="button"
                onClick={() => handleDownload("pdf")}
                disabled={downloading !== null}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <FileDown className="h-4 w-4" />
                {downloading === "pdf" ? "匯出中..." : "匯出 PDF"}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {loading || !report ? (
            <p className="text-sm text-gray-400">載入中...</p>
          ) : (
            <div className="space-y-5">
              {/* 損益摘要 */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs text-gray-500">收入合計</p>
                  <p className="mt-1 text-2xl font-bold text-green-700">{fmt(report.summary.incomeTotal)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs text-gray-500">支出合計</p>
                  <p className="mt-1 text-2xl font-bold text-red-700">{fmt(report.summary.expenseTotal)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs text-gray-500">本月淨損益（排除內部撥款）</p>
                  <p className={`mt-1 text-2xl font-bold ${report.summary.net < 0 ? "text-red-700" : "text-green-700"}`}>
                    {fmt(report.summary.net)}
                  </p>
                </div>
              </div>

              {/* 分類彙總 */}
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <CategorySection title="支出類別彙總" rows={report.expenseByCategory} />
                <CategorySection title="收入來源彙總" rows={report.incomeByCategory} />
              </div>

              {/* 股東結算 */}
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <SettlementTable title="股東結算（本月）" rows={report.settlement} />
                <SettlementTable title="股東累計結算（開帳以來）" rows={report.cumulativeSettlement} />
              </div>

              {/* 帳務明細 */}
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">
                  帳務明細（{report.records.length} 筆）
                </h3>
                {report.records.length === 0 ? (
                  <p className="p-4 text-sm text-gray-400">本月尚無帳目</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500">
                          <th className="px-3 py-2 text-left">日期</th>
                          <th className="px-3 py-2 text-left">類別</th>
                          <th className="px-3 py-2 text-left">關係人</th>
                          <th className="px-3 py-2 text-left">項目</th>
                          <th className="px-3 py-2 text-right">金額</th>
                          <th className="px-3 py-2 text-left">備註</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {report.records.map((r) => (
                          <tr key={r.id}>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.date}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-600">{TYPE_LABELS[r.type]}</td>
                            <td className="px-3 py-2 text-gray-700">{r.partyName}</td>
                            <td className="px-3 py-2 text-gray-700">
                              {r.type === "TRANSFER" ? `撥給 ${r.counterPartyName ?? "-"}` : r.categoryName ?? "-"}
                            </td>
                            <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                              r.type === "EXPENSE" ? "text-red-700" : r.type === "INCOME" ? "text-green-700" : "text-gray-800"
                            }`}>
                              {r.type === "EXPENSE" ? "-" : ""}{fmt(r.amount).replace("NT$ ", "$")}
                            </td>
                            <td className="max-w-[280px] truncate px-3 py-2 text-gray-500" title={r.note ?? ""}>
                              {r.note ?? "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
