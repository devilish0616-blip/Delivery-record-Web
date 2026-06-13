import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, getErrorMessage } from "../../api/client";
import type { DashboardData } from "../../api/types";

const quickLinks = [
  { to: "/admin/salary", label: "薪資計算" },
  { to: "/admin/dispatch", label: "派遣紀錄" },
  { to: "/admin/reconciliation", label: "貨運行對帳" },
  { to: "/admin/vehicles", label: "車輛管理" },
  { to: "/admin/employees", label: "員工管理" },
  { to: "/admin/settings", label: "系統設定" },
];

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<DashboardData>("/dashboard")
      .then(({ data }) => setData(data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-gray-500">載入中...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;

  const { today, month_summary, vehicles, todayMileage, alerts } = data;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">
        管理者儀表板 — {data.year} 年 {data.month} 月
      </h1>

      {(alerts.pricingNotSet || alerts.unreconciledPreviousMonth || alerts.vehiclesNeedingOilChange.length > 0) && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">待處理事項</p>
          <ul className="list-inside list-disc space-y-1">
            {alerts.pricingNotSet && (
              <li>
                尚未設定本月（{data.year} 年 {data.month} 月）收入單價，
                <Link to="/admin/settings" className="underline">
                  前往設定
                </Link>
              </li>
            )}
            {alerts.unreconciledPreviousMonth && (
              <li>
                尚未對帳 {alerts.unreconciledPreviousMonth.year} 年{" "}
                {alerts.unreconciledPreviousMonth.month} 月，
                <Link to="/admin/reconciliation" className="underline">
                  前往對帳
                </Link>
              </li>
            )}
            {alerts.vehiclesNeedingOilChange.map((v) => (
              <li key={v.id}>
                車輛 {v.plateNumber} 距下次換機油剩餘 {v.remainingToOilChange} km，建議檢查
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="今日正物流件數" value={`${today.forwardTotal}`} />
        <Card label="今日逆物流件數" value={`${today.reverseTotal}`} />
        <Card label="本月累計件數" value={`${month_summary.totalCount}`} />
        <Card label="本月預估薪資總支出" value={`$${month_summary.estimatedSalaryTotal.toLocaleString()}`} />
        <Card
          label="本月預估總收入"
          value={
            month_summary.estimatedRevenue !== null
              ? `$${month_summary.estimatedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : "尚未設定單價"
          }
        />
        <Card
          label="本月預估毛利"
          value={
            month_summary.estimatedProfit !== null
              ? `$${month_summary.estimatedProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : "-"
          }
          highlight
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          車輛狀況
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2">車牌</th>
                <th className="px-4 py-2">目前累計里程</th>
                <th className="px-4 py-2">距下次換機油</th>
                <th className="px-4 py-2">今日使用</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const usage = todayMileage.filter((m) => m.vehicleId === v.id);
                return (
                  <tr key={v.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{v.plateNumber}</td>
                    <td className="px-4 py-2">{v.currentMileage} km</td>
                    <td
                      className={`px-4 py-2 ${
                        v.oilChangeWarning ? "font-medium text-red-600" : ""
                      }`}
                    >
                      {v.remainingToOilChange} km
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {usage.length === 0
                        ? "-"
                        : usage
                            .map((m) => `${m.user?.name ?? ""} (${m.distance} km)`)
                            .join("、")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-medium text-gray-700">快速進入</h2>
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
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
