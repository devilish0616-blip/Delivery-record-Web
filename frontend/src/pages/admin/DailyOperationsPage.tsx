import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { apiClient, downloadFile, getErrorMessage } from "../../api/client";
import type { DashboardData } from "../../api/types";
import { YearMonthPicker } from "../../components/YearMonthPicker";

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function formatDateLabel(dateStr: string): { label: string; weekday: number } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return { label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, weekday: d.getUTCDay() };
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function profitClass(profit: number | null): string {
  if (profit === null) return "text-gray-400";
  return profit >= 0 ? "text-green-700" : "text-red-600";
}

export function DailyOperationsPage() {
  const navigate = useNavigate();
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadFile(
        `/dashboard/delivery-export?year=${year}&month=${month}`,
        `送件狀況_${year}-${String(month).padStart(2, "0")}.xlsx`
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient
      .get<DashboardData>("/dashboard", { params: { year, month } })
      .then(({ data }) => {
        if (active) setData(data);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [year, month]);

  const totals = useMemo(() => {
    const rows = data?.dailyBreakdown ?? [];
    return rows.reduce(
      (acc, d) => {
        acc.forwardCount += d.forwardCount;
        acc.reverseCount += d.reverseCount;
        acc.totalCount += d.totalCount;
        acc.salaryCost += d.salaryCost;
        if (d.revenue !== null) {
          acc.revenue += d.revenue;
          acc.hasRevenue = true;
        }
        return acc;
      },
      { forwardCount: 0, reverseCount: 0, totalCount: 0, salaryCost: 0, revenue: 0, hasRevenue: false }
    );
  }, [data]);

  const dayCount = data?.dailyBreakdown.length ?? 0;
  const totalProfit = totals.hasRevenue ? totals.revenue - totals.salaryCost : null;
  const totalProfitPerItem = totalProfit !== null && totals.totalCount > 0 ? totalProfit / totals.totalCount : null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate("/admin")}
        className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回儀表板
      </button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">每日營運總表</h1>
          <p className="mt-0.5 text-xs text-gray-400">本月每日件數、薪資支出與毛利，趨勢圖可快速看出哪幾天表現特別好或需要留意</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "匯出中..." : "匯出當月送件狀況"}
          </button>
          <YearMonthPicker year={year} month={month} onChange={(y, m) => setYearMonth({ year: y, month: m })} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">載入中...</p>}

      {!loading && data && data.dailyBreakdown.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label="當月總件數" value={`${totals.totalCount.toLocaleString()} 件`} />
            <StatTile label="總薪資支出" value={formatCurrency(totals.salaryCost)} />
            <StatTile label="總營收" value={totals.hasRevenue ? formatCurrency(totals.revenue) : "尚未設定單價"} />
            <StatTile
              label="總毛利"
              value={totalProfit !== null ? formatCurrency(totalProfit) : "-"}
              tone={totalProfit === null ? undefined : totalProfit >= 0 ? "good" : "bad"}
            />
            <StatTile
              label="平均每日毛利"
              value={totalProfit !== null ? formatCurrency(totalProfit / Math.max(dayCount, 1)) : "-"}
              tone={totalProfit === null ? undefined : totalProfit >= 0 ? "good" : "bad"}
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
              {totals.hasRevenue ? "每日毛利趨勢" : "每日總件數趨勢（尚未設定收入單價，暫以件數呈現）"}
            </p>
            <DailyTrendChart items={data.dailyBreakdown} useProfit={totals.hasRevenue} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2">日期</th>
                    <th className="whitespace-nowrap px-3 py-2">總正物流</th>
                    <th className="whitespace-nowrap px-3 py-2">總逆物流</th>
                    <th className="whitespace-nowrap px-3 py-2">總件數（正+逆）</th>
                    <th className="whitespace-nowrap px-3 py-2">總支付薪資</th>
                    <th className="whitespace-nowrap px-3 py-2">營業營收</th>
                    <th className="whitespace-nowrap px-3 py-2">扣除薪水盈餘</th>
                    <th className="whitespace-nowrap px-3 py-2">平均件數獲利</th>
                    <th className="whitespace-nowrap px-3 py-2">出勤人數</th>
                    <th className="whitespace-nowrap px-3 py-2">司機</th>
                    <th className="whitespace-nowrap px-3 py-2">跟車</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dailyBreakdown.map((d) => {
                    const { label, weekday } = formatDateLabel(d.date);
                    const isWeekend = weekday === 0 || weekday === 6;
                    return (
                      <tr key={d.date} className={`border-t border-gray-100 ${isWeekend ? "bg-gray-50/70" : ""}`}>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-800">
                          {label}（{weekdayLabels[weekday]}）
                          {isWeekend && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">假日</span>}
                        </td>
                        <td className="px-3 py-2 font-mono">{d.forwardCount}</td>
                        <td className="px-3 py-2 font-mono">{d.reverseCount}</td>
                        <td className="px-3 py-2 font-mono font-medium">{d.totalCount}</td>
                        <td className="px-3 py-2 font-mono">{formatCurrency(d.salaryCost)}</td>
                        <td className="px-3 py-2 font-mono">{d.revenue !== null ? formatCurrency(d.revenue) : "-"}</td>
                        <td className={`px-3 py-2 font-mono font-medium ${profitClass(d.profit)}`}>
                          {d.profit !== null ? formatCurrency(d.profit) : "-"}
                        </td>
                        <td className={`px-3 py-2 font-mono ${profitClass(d.profit)}`}>
                          {d.profitPerItem !== null ? d.profitPerItem.toFixed(2) : "-"}
                        </td>
                        <td className="px-3 py-2 font-mono">{d.attendanceCount}</td>
                        <td className="px-3 py-2 text-gray-500">{d.drivers.length > 0 ? d.drivers.join("、") : "-"}</td>
                        <td className="px-3 py-2 text-gray-500">{d.attendants.length > 0 ? d.attendants.join("、") : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                    <td className="whitespace-nowrap px-3 py-2">平均</td>
                    <td className="px-3 py-2 font-mono">{Math.round(totals.forwardCount / dayCount)}</td>
                    <td className="px-3 py-2 font-mono">{Math.round(totals.reverseCount / dayCount)}</td>
                    <td className="px-3 py-2 font-mono">{Math.round(totals.totalCount / dayCount)}</td>
                    <td className="px-3 py-2 font-mono">{formatCurrency(totals.salaryCost / dayCount)}</td>
                    <td className="px-3 py-2 font-mono">{totals.hasRevenue ? formatCurrency(totals.revenue / dayCount) : "-"}</td>
                    <td className="px-3 py-2 font-mono">{totalProfit !== null ? formatCurrency(totalProfit / dayCount) : "-"}</td>
                    <td className="px-3 py-2 font-mono">{totalProfitPerItem !== null ? totalProfitPerItem.toFixed(2) : "-"}</td>
                    <td className="px-3 py-2" colSpan={3}></td>
                  </tr>
                  <tr className="bg-gray-50 font-medium">
                    <td className="whitespace-nowrap px-3 py-2">總計</td>
                    <td className="px-3 py-2 font-mono">{totals.forwardCount}</td>
                    <td className="px-3 py-2 font-mono">{totals.reverseCount}</td>
                    <td className="px-3 py-2 font-mono">{totals.totalCount}</td>
                    <td className="px-3 py-2 font-mono">{formatCurrency(totals.salaryCost)}</td>
                    <td className="px-3 py-2 font-mono">{totals.hasRevenue ? formatCurrency(totals.revenue) : "-"}</td>
                    <td className="px-3 py-2 font-mono">{totalProfit !== null ? formatCurrency(totalProfit) : "-"}</td>
                    <td className="px-3 py-2 font-mono">{totalProfitPerItem !== null ? totalProfitPerItem.toFixed(2) : "-"}</td>
                    <td className="px-3 py-2" colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
      <p className="text-[11px] font-semibold text-gray-400">{label}</p>
      <p
        className={`mt-1 font-mono text-xl font-bold ${
          tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-600" : "text-gray-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// 簡易 SVG 折線圖：X 軸為當月每一天，Y 軸依有無設定單價顯示毛利或總件數，
// 滑鼠移動時顯示十字線與數值 tooltip
function DailyTrendChart({
  items,
  useProfit,
}: {
  items: DashboardData["dailyBreakdown"];
  useProfit: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const w = 900;
  const h = 190;
  const padL = 46;
  const padR = 10;
  const padT = 14;
  const padB = 24;

  const values = items.map((d) => (useProfit ? (d.profit ?? 0) : d.totalCount));
  const minY = Math.min(0, ...values);
  const maxY = Math.max(...values, 1);
  const x = (i: number) => padL + (items.length > 1 ? (i / (items.length - 1)) * (w - padL - padR) : 0);
  const y = (v: number) => h - padB - ((v - minY) / (maxY - minY || 1)) * (h - padT - padB);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const hovered = hoverIdx !== null ? items[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const idx = Math.round(ratio * (items.length - 1) * (w / (w - padL - padR)) - (padL / (w - padL - padR)) * (items.length - 1));
          const clamped = Math.max(0, Math.min(items.length - 1, idx));
          setHoverIdx(clamped);
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[minY, (minY + maxY) / 2, maxY].map((v, i) => (
          <g key={i}>
            <text x={2} y={y(v) + 3} fontSize={9} fill="#9ca3af">
              {Math.round(v).toLocaleString()}
            </text>
            <line x1={padL} y1={y(v)} x2={w - padR} y2={y(v)} stroke="#e5e7eb" strokeWidth={1} />
          </g>
        ))}
        {useProfit && <line x1={padL} y1={zeroY} x2={w - padR} y2={zeroY} stroke="#c3c9d6" strokeWidth={1.2} />}
        <path d={path} fill="none" stroke="#2851aa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {hoverIdx !== null && (
          <>
            <line x1={x(hoverIdx)} y1={padT} x2={x(hoverIdx)} y2={h - padB} stroke="#c3c9d6" strokeDasharray="3,3" strokeWidth={1} />
            <circle cx={x(hoverIdx)} cy={y(values[hoverIdx])} r={4.5} fill="#2851aa" stroke="#fff" strokeWidth={2} />
          </>
        )}
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#c3c9d6" strokeWidth={1} />
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute rounded-md bg-gray-800 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{
            left: `${(x(hoverIdx!) / w) * 100}%`,
            top: 0,
            transform: "translate(-50%, -100%)",
          }}
        >
          <p className="font-mono font-semibold">{formatDateLabel(hovered.date).label}</p>
          <p className="font-mono">
            {useProfit ? `毛利 ${formatCurrency(hovered.profit ?? 0)}` : `件數 ${hovered.totalCount}`}
          </p>
        </div>
      )}
    </div>
  );
}
