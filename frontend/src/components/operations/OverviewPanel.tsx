import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { DashboardData } from "../../api/types";
import { DailyTrendChart } from "../../components/DailyTrendChart";

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// 營運總覽「總覽」分頁：當月件數、預估收支與每日件數趨勢（待處理提醒已移到首頁「我的待辦」）
export function OverviewPanel() {
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

  const { today, month_summary } = data ?? ({} as Partial<DashboardData>);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-600">{data ? `${data.year} 年 ${data.month} 月` : ""}</p>
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

      {data && month_summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {today && (
              <>
                <Card label="今日正物流件數" value={`${today.forwardTotal}`} />
                <Card label="今日逆物流件數" value={`${today.reverseTotal}`} />
              </>
            )}
            <Card label="當月累計件數" value={`${month_summary.totalCount}`} />
            <Card label="當月預估薪資總支出" value={`$${month_summary.estimatedSalaryTotal.toLocaleString()}`} />
            <Card
              label="當月預估總收入"
              value={
                month_summary.estimatedRevenue !== null
                  ? `$${month_summary.estimatedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : "尚未設定單價"
              }
            />
            <Card
              label="當月預估毛利"
              value={
                month_summary.estimatedProfit !== null
                  ? `$${month_summary.estimatedProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : "-"
              }
              highlight
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">每日總件數趨勢</p>
              {data.dailyBreakdown.length > 0 && (
                <p className="font-mono text-xs text-gray-500">
                  當月合計 {month_summary.totalCount.toLocaleString()} 件・日均{" "}
                  {Math.round(month_summary.totalCount / data.dailyBreakdown.length).toLocaleString()} 件
                </p>
              )}
            </div>
            {data.dailyBreakdown.length > 0 ? (
              <DailyTrendChart items={data.dailyBreakdown} useProfit={false} />
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">本月尚無送件資料</p>
            )}
          </div>

        </>
      )}
    </div>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${
        highlight ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${highlight ? "text-blue-700" : "text-gray-800"}`}>
        {value}
      </p>
    </div>
  );
}
