import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { EmployeePerformanceData } from "../../api/types";

const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

export function EmployeePerformancePage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<EmployeePerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(targetYear: number) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<EmployeePerformanceData>(`/deliveries/performance/${targetYear}`);
      setData(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">員工績效統計</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            上一年
          </button>
          <span className="text-sm font-medium text-gray-700">{year} 年</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= currentYear}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一年
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">載入中...</p>
      ) : !data || data.employees.length === 0 ? (
        <p className="text-sm text-gray-500">尚無資料</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="sticky left-0 bg-gray-50 px-4 py-2">員工</th>
                {monthLabels.map((label) => (
                  <th key={label} className="px-3 py-2 text-right">
                    {label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">全年合計</th>
                <th className="px-3 py-2 text-right text-gray-400">正物流合計</th>
                <th className="px-3 py-2 text-right text-gray-400">逆物流合計</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((emp) => (
                <tr key={emp.userId} className="border-t border-gray-100">
                  <td className="sticky left-0 bg-white px-4 py-2 font-medium text-gray-800">{emp.name}</td>
                  {emp.months.map((m, idx) => (
                    <td key={idx} className="px-3 py-2 text-right text-gray-600">
                      {m.total === 0 ? "-" : m.total}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold text-gray-800">{emp.yearTotal.total}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{emp.yearTotal.forwardCount}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{emp.yearTotal.reverseCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
