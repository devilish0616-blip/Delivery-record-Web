import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, getErrorMessage } from "../../api/client";
import type { DashboardData } from "../../api/types";

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
  if (profit === null) return "";
  return profit >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700";
}

export function DailyOperationsPage() {
  const navigate = useNavigate();
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate("/admin")}
        className="text-sm text-blue-600 hover:underline"
      >
        ← 返回儀表板
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">每日營運總表</h1>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYearMonth((s) => ({ ...s, year: Number(e.target.value) }))}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setYearMonth((s) => ({ ...s, month: Number(e.target.value) }))}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m} 月
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">載入中...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && data.dailyBreakdown.length > 0 && (
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
                    <tr key={d.date} className="border-t border-gray-100">
                      <td
                        className={`whitespace-nowrap px-3 py-2 ${
                          isWeekend ? "text-red-600" : "text-gray-800"
                        }`}
                      >
                        {label}（{weekdayLabels[weekday]}）
                      </td>
                      <td className="px-3 py-2">{d.forwardCount}</td>
                      <td className="px-3 py-2">{d.reverseCount}</td>
                      <td className="px-3 py-2 font-medium">{d.totalCount}</td>
                      <td className="px-3 py-2">{formatCurrency(d.salaryCost)}</td>
                      <td className="px-3 py-2">{d.revenue !== null ? formatCurrency(d.revenue) : "-"}</td>
                      <td className={`px-3 py-2 ${profitClass(d.profit)}`}>
                        {d.profit !== null ? formatCurrency(d.profit) : "-"}
                      </td>
                      <td className={`px-3 py-2 ${profitClass(d.profit)}`}>
                        {d.profitPerItem !== null ? d.profitPerItem.toFixed(2) : "-"}
                      </td>
                      <td className="px-3 py-2">{d.attendanceCount}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {d.drivers.length > 0 ? d.drivers.join("、") : "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {d.attendants.length > 0 ? d.attendants.join("、") : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const totals = data.dailyBreakdown.reduce(
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
                  const dayCount = data.dailyBreakdown.length;
                  const totalProfit = totals.hasRevenue ? totals.revenue - totals.salaryCost : null;
                  const totalProfitPerItem =
                    totalProfit !== null && totals.totalCount > 0 ? totalProfit / totals.totalCount : null;
                  return (
                    <>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                        <td className="whitespace-nowrap px-3 py-2">平均</td>
                        <td className="px-3 py-2">{Math.round(totals.forwardCount / dayCount)}</td>
                        <td className="px-3 py-2">{Math.round(totals.reverseCount / dayCount)}</td>
                        <td className="px-3 py-2">{Math.round(totals.totalCount / dayCount)}</td>
                        <td className="px-3 py-2">{formatCurrency(totals.salaryCost / dayCount)}</td>
                        <td className="px-3 py-2">
                          {totals.hasRevenue ? formatCurrency(totals.revenue / dayCount) : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {totalProfit !== null ? formatCurrency(totalProfit / dayCount) : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {totalProfitPerItem !== null ? totalProfitPerItem.toFixed(2) : "-"}
                        </td>
                        <td className="px-3 py-2" colSpan={3}></td>
                      </tr>
                      <tr className="bg-gray-50 font-medium">
                        <td className="whitespace-nowrap px-3 py-2">總計</td>
                        <td className="px-3 py-2">{totals.forwardCount}</td>
                        <td className="px-3 py-2">{totals.reverseCount}</td>
                        <td className="px-3 py-2">{totals.totalCount}</td>
                        <td className="px-3 py-2">{formatCurrency(totals.salaryCost)}</td>
                        <td className="px-3 py-2">{totals.hasRevenue ? formatCurrency(totals.revenue) : "-"}</td>
                        <td className="px-3 py-2">{totalProfit !== null ? formatCurrency(totalProfit) : "-"}</td>
                        <td className="px-3 py-2">
                          {totalProfitPerItem !== null ? totalProfitPerItem.toFixed(2) : "-"}
                        </td>
                        <td className="px-3 py-2" colSpan={3}></td>
                      </tr>
                    </>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
