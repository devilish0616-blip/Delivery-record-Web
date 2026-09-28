import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { apiClient, downloadFile, getErrorMessage } from "../../api/client";
import type { DashboardData } from "../../api/types";
import { YearMonthPicker } from "../../components/YearMonthPicker";
import { DailyTrendChart, formatCurrency, formatDateLabel, weekdayLabels } from "../../components/DailyTrendChart";

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
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
