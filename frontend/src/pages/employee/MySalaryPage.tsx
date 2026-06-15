import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { EmployeeMonthlySalary } from "../../api/types";

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const titleLabels: Record<string, string> = {
  SENIOR: "資深員工",
  STAFF: "員工",
  TEMP: "臨時工",
  CEO: "執行長",
  SPECIAL: "特殊",
};

export function MySalaryPage() {
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [salary, setSalary] = useState<EmployeeMonthlySalary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient
      .get<EmployeeMonthlySalary>("/salary/me", { params: { year, month } })
      .then(({ data }) => {
        if (active) setSalary(data);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">我的薪資</h1>
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

      {salary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="出勤天數" value={`${salary.attendanceDays} 天`} />
            <SummaryCard
              label="職稱判定"
              value={`${titleLabels[salary.titleCategory] ?? salary.titleCategory}${
                salary.titleLevel ? ` (${salary.titleLevel === "HIGH" ? "高" : "低"})` : ""
              }`}
            />
            <SummaryCard label="當月總件數" value={`${salary.totalDeliveryCount} 件`} />
            <SummaryCard label="日平均件數" value={salary.averageDailyCount.toFixed(1)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="按件薪資" value={`$${salary.pieceWorkTotal.toLocaleString()}`} />
            <SummaryCard
              label="司機加給"
              value={`$${salary.driverBonusTotal.toLocaleString()} (${salary.driverDays} 天)`}
            />
            <SummaryCard
              label="隨車加給"
              value={`$${salary.attendantBonusTotal.toLocaleString()} (${salary.attendantDays} 天)`}
            />
            <SummaryCard label="職務加給" value={`$${salary.jobAllowance.toLocaleString()}`} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            <SummaryCard label="激勵獎金" value={`$${salary.incentiveBonus.toLocaleString()}`} />
            <SummaryCard
              label="總薪資"
              value={`$${salary.totalSalary.toLocaleString()}`}
              highlight
            />
          </div>

          {salary.deductions.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
                扣薪項目
              </h2>
              <ul className="divide-y divide-gray-100">
                {salary.deductions.map((d) => (
                  <li key={d.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-gray-700">{d.reason}</span>
                    <span className="text-red-600">-{d.amount.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2 text-sm font-semibold">
                <span>扣款合計</span>
                <span className="text-red-600">-{salary.deductionTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {salary.formulaNotes && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
              <span className="font-medium">薪資計算公式說明：</span>
              {salary.formulaNotes}
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
              每日明細
            </h2>
            {salary.dailyDetails.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">本月尚無送件紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-2">日期</th>
                      <th className="px-4 py-2">正物流</th>
                      <th className="px-4 py-2">逆物流</th>
                      <th className="px-4 py-2">當日件數</th>
                      <th className="px-4 py-2">單價</th>
                      <th className="px-4 py-2">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salary.dailyDetails.map((d) => (
                      <tr key={d.date} className="border-t border-gray-100">
                        <td className="px-4 py-2">{d.date}</td>
                        <td className="px-4 py-2">{d.forwardCount}</td>
                        <td className="px-4 py-2">{d.reverseCount}</td>
                        <td className="px-4 py-2">{d.totalCount}</td>
                        <td className="px-4 py-2">{d.rate}</td>
                        <td className="px-4 py-2">{d.subtotal.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
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
